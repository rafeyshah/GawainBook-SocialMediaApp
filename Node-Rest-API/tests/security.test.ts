// "Nobody can act as another user": authentication, authorization and CSRF.
import { eq } from "drizzle-orm";
import { app, request, newClient, signUp, createPost, sessionTokenFrom, Client, CONSENT } from "./helpers";
import { getDb } from "../src/db/client";
import { sessions } from "../src/db/schema";
import { hashToken } from "../src/auth";

// Every route except sign-up/sign-in/sign-out, the email links, the legal pages,
// the waitlist and health. When a route is added, add it here.
const ID = "64b000000000000000000000";
const PROTECTED: [string, string][] = [
  ["GET", "/api/auth/me"],
  ["POST", "/api/auth/resend-verification"],
  ["PUT", "/api/account/password"],
  ["GET", "/api/account/export"],
  ["DELETE", "/api/account"],
  ["GET", "/api/users?username=x"],
  ["GET", `/api/users/friends/${ID}`],
  ["PUT", `/api/users/${ID}`],
  ["DELETE", `/api/users/${ID}`],
  ["PUT", `/api/users/${ID}/follow`],
  ["PUT", `/api/users/${ID}/unfollow`],
  ["POST", "/api/posts"],
  ["GET", "/api/posts/timeline"],
  ["GET", "/api/posts/profile/x"],
  ["GET", `/api/posts/${ID}`],
  ["PUT", `/api/posts/${ID}`],
  ["DELETE", `/api/posts/${ID}`],
  ["PUT", `/api/posts/${ID}/like`],
  ["GET", `/api/posts/${ID}/comments`],
  ["POST", `/api/posts/${ID}/comments`],
  ["PATCH", `/api/post-comments/${ID}`],
  ["DELETE", `/api/post-comments/${ID}`],
  ["POST", "/api/upload"],
  ["GET", "/api/books"],
  ["GET", "/api/books/search?q=emma"],
  ["GET", "/api/books/x"],
  ["PUT", "/api/books/x/progress"],
  ["DELETE", "/api/books/x/progress"],
  ["POST", "/api/books/import"],
  ["POST", "/api/books/x/chapters"],
  ["POST", "/api/books/x/chapters/restore"],
  ["GET", "/api/shelves"],
  ["GET", "/api/circles"],
  ["POST", "/api/circles"],
  ["POST", "/api/circles/join"],
  ["GET", "/api/invitations/x"],
  ["GET", `/api/circles/${ID}`],
  ["POST", `/api/circles/${ID}/join`],
  ["POST", `/api/circles/${ID}/leave`],
  ["PUT", `/api/circles/${ID}/members/${ID}`],
  ["DELETE", `/api/circles/${ID}/members/${ID}`],
  ["GET", `/api/circles/${ID}/invitations`],
  ["POST", `/api/circles/${ID}/invitations`],
  ["DELETE", `/api/circles/${ID}/invitations/${ID}`],
  ["GET", `/api/circles/${ID}/threads`],
  ["POST", `/api/circles/${ID}/threads`],
  ["GET", `/api/circles/${ID}/search?q=x`],
  ["GET", `/api/circles/${ID}/reports`],
  ["GET", `/api/threads/${ID}`],
  ["PATCH", `/api/threads/${ID}`],
  ["DELETE", `/api/threads/${ID}`],
  ["POST", `/api/threads/${ID}/comments`],
  ["POST", `/api/threads/${ID}/hide`],
  ["POST", `/api/threads/${ID}/unhide`],
  ["PATCH", `/api/comments/${ID}`],
  ["DELETE", `/api/comments/${ID}`],
  ["POST", `/api/comments/${ID}/hide`],
  ["POST", `/api/comments/${ID}/unhide`],
  ["POST", "/api/reports"],
  ["POST", `/api/reports/${ID}/dismiss`],
  ["GET", "/api/blocks"],
  ["PUT", `/api/blocks/${ID}`],
  ["DELETE", `/api/blocks/${ID}`],
  ["GET", "/api/notifications"],
  ["POST", "/api/notifications/read"],
  ["GET", "/api/admin/stats"],
  ["GET", "/api/admin/reports"],
  ["POST", `/api/admin/reports/${ID}/dismiss`],
  ["DELETE", `/api/admin/posts/${ID}`],
  ["DELETE", `/api/admin/post-comments/${ID}`],
  ["POST", `/api/admin/users/${ID}/suspend`],
  ["POST", `/api/admin/users/${ID}/unsuspend`],
];

const send = (client: Client, method: string, url: string, body?: object) =>
  method === "GET"
    ? client.get(url)
    : method === "POST"
    ? client.post(url, body)
    : method === "PUT"
    ? client.put(url, body)
    : method === "PATCH"
    ? client.patch(url, body)
    : client.delete(url, body);

describe("every protected route requires a session", () => {
  test.each(PROTECTED)("%s %s → 401 without a cookie", async (method, url) => {
    const res = await send(await newClient(), method, url);
    expect(res.status).toBe(401);
  });

  test.each([
    ["a made-up token", "gb_session=" + "x".repeat(43)],
    ["an empty token", "gb_session="],
    ["a very long token", "gb_session=" + "x".repeat(5000)],
    ["SQL in the token", "gb_session=' or 1=1 --aaaaaaaaaaaaaaaaaaaa"],
  ])("rejects %s", async (_name, cookie) => {
    expect((await request(app).get("/api/auth/me").set("Cookie", cookie)).status).toBe(401);
  });

  test("a tampered token (one character changed) is rejected", async () => {
    const reg = await (await newClient()).post("/api/auth/register", { username: "tam", email: "t@example.com", password: "secret123", ...CONSENT });
    const token = sessionTokenFrom(reg)!;
    const tampered = (token[0] === "A" ? "B" : "A") + token.slice(1);
    expect((await request(app).get("/api/auth/me").set("Cookie", `gb_session=${token}`)).status).toBe(200);
    expect((await request(app).get("/api/auth/me").set("Cookie", `gb_session=${tampered}`)).status).toBe(401);
  });

  test("an expired session is rejected", async () => {
    const reg = await (await newClient()).post("/api/auth/register", { username: "old", email: "o@example.com", password: "secret123", ...CONSENT });
    const token = sessionTokenFrom(reg)!;
    await getDb().update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.tokenHash, hashToken(token)));
    expect((await request(app).get("/api/auth/me").set("Cookie", `gb_session=${token}`)).status).toBe(401);
  });

  test("deleting the account ends its sessions", async () => {
    const { client, user } = await signUp();
    void user;
    expect((await client.delete("/api/account", { password: "secret123" })).status).toBe(200);
    expect((await client.get("/api/auth/me")).status).toBe(401);
  });
});

describe("user A can't act as user B", () => {
  let alice: Awaited<ReturnType<typeof signUp>>;
  let bob: Awaited<ReturnType<typeof signUp>>;
  beforeEach(async () => {
    alice = await signUp({ username: "alice" });
    bob = await signUp({ username: "bobby" });
  });

  test("a userId in the body is ignored: posts are always by the signed-in user", async () => {
    const res = await alice.client.post("/api/posts", { userId: bob.user._id, desc: "Pretending to be Bob" });
    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(alice.user._id);
    expect((await bob.client.get("/api/posts/profile/bobby")).body).toEqual([]);
  });

  test("likes are always recorded for the signed-in user", async () => {
    const post = await createPost(bob.client);
    await alice.client.put(`/api/posts/${post._id}/like`, { userId: bob.user._id });
    expect((await bob.client.get(`/api/posts/${post._id}`)).body.likes).toEqual([alice.user._id]);
  });

  test("follows are always made by the signed-in user", async () => {
    const carol = await signUp({ username: "carol" });
    await alice.client.put(`/api/users/${carol.user._id}/follow`, { userId: bob.user._id });
    const followers = (await carol.client.get("/api/users", { userId: carol.user._id })).body.followers;
    expect(followers).toEqual([alice.user._id]);
  });

  test("can't edit or delete another reader's account, even with their userId in the body", async () => {
    const edit = await alice.client.put(`/api/users/${bob.user._id}`, { userId: bob.user._id, desc: "hacked" });
    const del = await alice.client.delete(`/api/users/${bob.user._id}`, { userId: bob.user._id });
    expect([edit.status, del.status]).toEqual([403, 403]);
    expect((await bob.client.get("/api/auth/me")).status).toBe(200);
    expect((await bob.client.get("/api/users", { userId: bob.user._id })).body.desc).toBeNull();
  });

  test("can't edit or delete another reader's post", async () => {
    const post = await createPost(bob.client, { desc: "Bob's post" });
    expect((await alice.client.put(`/api/posts/${post._id}`, { desc: "hacked" })).status).toBe(403);
    expect((await alice.client.delete(`/api/posts/${post._id}`)).status).toBe(403);
    expect((await bob.client.get(`/api/posts/${post._id}`)).body.desc).toBe("Bob's post");
  });

  test("the timeline is always the signed-in user's own", async () => {
    await createPost(bob.client, { desc: "bob only" });
    expect((await alice.client.get("/api/posts/timeline")).body).toEqual([]);
  });

  test("changing your password signs out your other sessions", async () => {
    const other = await newClient();
    await other.post("/api/auth/login", { email: alice.user.email, password: "secret123" });
    expect((await alice.client.put("/api/account/password", { currentPassword: "secret123", newPassword: "brandnew99" })).status).toBe(200);
    expect((await other.get("/api/auth/me")).status).toBe(401);
    // …but keeps you signed in where you changed it.
    expect((await alice.client.get("/api/auth/me")).status).toBe(200);
  });
});

describe("CSRF protection", () => {
  test("every response gives the browser a readable CSRF cookie", async () => {
    const res = await request(app).get("/api/health");
    const cookie = ((res.headers["set-cookie"] as unknown as string[]) || []).find((c) => c.startsWith("gb_csrf="));
    expect(cookie).toBeDefined();
    expect(cookie).not.toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  test("a signed-in write without the CSRF header is refused", async () => {
    const { client } = await signUp();
    const res = await client.agent.post("/api/posts").send({ desc: "forged" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/refresh the page/);
  });

  test("a wrong CSRF header is refused", async () => {
    const { client } = await signUp();
    const res = await client.agent.post("/api/posts").set("X-CSRF-Token", "x".repeat(43)).send({ desc: "forged" });
    expect(res.status).toBe(403);
  });

  test("a header that doesn't match the cookie is refused, even if both look valid", async () => {
    const { client } = await signUp();
    const other = await newClient();
    const res = await client.agent.post("/api/posts").set("X-CSRF-Token", other.csrf).send({ desc: "forged" });
    expect(res.status).toBe(403);
  });

  test("sign-in rotates the CSRF token", async () => {
    const client = await newClient();
    const before = client.csrf;
    await client.post("/api/auth/register", { username: "rot", email: "r@example.com", password: "secret123", ...CONSENT });
    expect(client.csrf).not.toBe(before);
  });

  test("reads (GET) don't need the header", async () => {
    const { client } = await signUp();
    expect((await client.agent.get("/api/auth/me")).status).toBe(200);
  });

  test("login itself requires the CSRF header (blocks login CSRF)", async () => {
    await signUp({ email: "victim@example.com" });
    const res = await request(app).post("/api/auth/login").send({ email: "victim@example.com", password: "secret123" });
    expect(res.status).toBe(403);
  });
});
