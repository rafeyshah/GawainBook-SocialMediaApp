import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { reports, users } from "../src/db/schema";
import { createPost, newClient, signUp, NONEXISTENT_UUID } from "./helpers";
import { makeBook, makeCircle, makeThread, setProgress } from "./reading.helpers";

type Account = Awaited<ReturnType<typeof signUp>>;
const makeAdmin = (a: Account) => getDb().update(users).set({ isAdmin: true }).where(eq(users.id, a.user._id));

async function world() {
  const [admin, alice, bob] = await Promise.all([signUp(), signUp(), signUp()]);
  await makeAdmin(admin);
  return { admin, alice, bob };
}

const report = (a: Account, targetType: string, targetId: string, reason = "harassment") => a.client.post("/api/reports", { targetType, targetId, reason });

describe("reporting posts and profiles", () => {
  test("a reader reports a post and a profile; both go to the admin queue (not to any circle)", async () => {
    const { admin, alice, bob } = await world();
    const post = await createPost(bob.client, { desc: "Rude post" });
    expect((await report(alice, "post", post._id, "spam")).status).toBe(201);
    expect((await report(alice, "user", bob.user._id)).status).toBe(201);
    const [r] = await getDb().select().from(reports).where(eq(reports.targetType, "post"));
    expect(r.circleId).toBeNull();

    const queue = (await admin.client.get("/api/admin/reports")).body;
    expect(queue).toHaveLength(2);
    const postReport = queue.find((q: { targetType: string }) => q.targetType === "post");
    expect(postReport).toMatchObject({ reason: "spam", reporter: { _id: alice.user._id }, target: { text: "Rude post", author: { _id: bob.user._id } } });
    const userReport = queue.find((q: { targetType: string }) => q.targetType === "user");
    expect(userReport.target).toMatchObject({ _id: bob.user._id, username: bob.user.username });
  });

  test("one open report per reader per item", async () => {
    const { alice, bob } = await world();
    const post = await createPost(bob.client);
    await report(alice, "post", post._id);
    expect((await report(alice, "post", post._id)).status).toBe(409);
  });

  test("you can't report yourself or your own post", async () => {
    const { alice } = await world();
    const post = await createPost(alice.client);
    expect((await report(alice, "post", post._id)).status).toBe(400);
    expect((await report(alice, "user", alice.user._id)).status).toBe(400);
  });

  test.each([["unknown post", "post", NONEXISTENT_UUID], ["unknown user", "user", NONEXISTENT_UUID], ["malformed id", "post", "abc"]])(
    "%s is 404",
    async (_n, type, id) => {
      const { alice } = await world();
      expect((await report(alice, type, id)).status).toBe(404);
    }
  );

  test("blocked readers and suspended profiles can't be reported (they don't exist for you)", async () => {
    const { alice, bob } = await world();
    const post = await createPost(bob.client);
    await alice.client.put(`/api/blocks/${bob.user._id}`);
    expect((await report(alice, "post", post._id)).status).toBe(404);
    const carol = await signUp();
    await getDb().update(users).set({ suspendedAt: new Date() }).where(eq(users.id, carol.user._id));
    expect((await report(alice, "user", carol.user._id)).status).toBe(404);
  });

  test("circle moderators can't dismiss site-wide reports through the circle route", async () => {
    const { alice, bob } = await world();
    const post = await createPost(bob.client);
    const { body } = await report(alice, "post", post._id);
    const book = await makeBook(3);
    await makeCircle(bob, book.id);
    expect((await bob.client.post(`/api/reports/${body._id}/dismiss`)).status).toBe(404);
  });

  test("circle reports still go to the circle, not the admin queue", async () => {
    const { admin, alice, bob } = await world();
    const book = await makeBook(5);
    const circle = await makeCircle(bob, book.id);
    await alice.client.post(`/api/circles/${circle._id}/join`);
    await setProgress(bob, book.id, 3);
    await setProgress(alice, book.id, 3);
    const t = await makeThread(bob, circle._id, 2);
    expect((await report(alice, "thread", t._id)).status).toBe(201);
    expect((await admin.client.get("/api/admin/reports")).body).toEqual([]);
    expect((await bob.client.get(`/api/circles/${circle._id}/reports`)).body).toHaveLength(1);
  });
});

describe("admin area", () => {
  test("is invisible (404) to non-admins and 401 when signed out", async () => {
    const { alice } = await world();
    for (const [method, url] of [
      ["get", "/api/admin/stats"],
      ["get", "/api/admin/reports"],
      ["post", `/api/admin/users/${NONEXISTENT_UUID}/suspend`],
      ["delete", `/api/admin/posts/${NONEXISTENT_UUID}`],
    ] as const) {
      expect((await alice.client[method](url)).status).toBe(404);
      expect((await (await newClient())[method](url)).status).toBe(401);
    }
  });

  test("stats count users, suspended accounts, circles and open site-wide reports", async () => {
    const { admin, alice, bob } = await world();
    await makeCircle(alice, (await makeBook(2)).id);
    await report(alice, "user", bob.user._id);
    expect((await admin.client.get("/api/admin/stats")).body).toEqual({ users: 3, suspended: 0, circles: 1, openReports: 1 });
  });

  test("deleting a reported post removes it and settles its reports", async () => {
    const { admin, alice, bob } = await world();
    const post = await createPost(bob.client, { desc: "Spam!" });
    await report(alice, "post", post._id, "spam");
    expect((await admin.client.delete(`/api/admin/posts/${post._id}`)).body).toEqual({ deleted: true });
    expect((await alice.client.get(`/api/posts/${post._id}`)).status).toBe(404);
    expect((await admin.client.get("/api/admin/reports")).body).toEqual([]);
    expect((await admin.client.delete(`/api/admin/posts/${post._id}`)).status).toBe(404);
  });

  test("dismissing a report, only once", async () => {
    const { admin, alice, bob } = await world();
    const { body } = await report(alice, "user", bob.user._id);
    expect((await admin.client.post(`/api/admin/reports/${body._id}/dismiss`)).body).toEqual({ status: "dismissed" });
    expect((await admin.client.post(`/api/admin/reports/${body._id}/dismiss`)).status).toBe(404);
    expect((await admin.client.get("/api/admin/reports")).body).toEqual([]);
  });

  test("suspending signs the reader out everywhere, settles reports, and can be undone", async () => {
    const { admin, alice, bob } = await world();
    await report(alice, "user", bob.user._id);
    expect((await admin.client.post(`/api/admin/users/${bob.user._id}/suspend`)).body).toEqual({ suspended: true });
    // Their sessions are gone (401); signing in again is refused (403, see account tests).
    expect((await bob.client.get("/api/auth/me")).status).toBe(401);
    expect((await (await newClient()).post("/api/auth/login", { email: bob.user.email, password: "secret123" })).status).toBe(403);
    expect((await admin.client.get("/api/admin/reports")).body).toEqual([]);
    // Admins can still see the profile, flagged.
    expect((await admin.client.get("/api/users", { userId: bob.user._id })).body.suspended).toBe(true);
    expect((await alice.client.get("/api/users", { userId: bob.user._id })).status).toBe(404);

    expect((await admin.client.post(`/api/admin/users/${bob.user._id}/unsuspend`)).body).toEqual({ suspended: false });
    const login = await (await newClient()).post("/api/auth/login", { email: bob.user.email, password: "secret123" });
    expect(login.status).toBe(200);
    expect((await alice.client.get("/api/users", { userId: bob.user._id })).status).toBe(200);
  });

  test("admins can't suspend themselves or other admins; unknown users are 404", async () => {
    const { admin } = await world();
    const other = await signUp();
    await makeAdmin(other);
    expect((await admin.client.post(`/api/admin/users/${admin.user._id}/suspend`)).status).toBe(400);
    expect((await admin.client.post(`/api/admin/users/${other.user._id}/suspend`)).status).toBe(403);
    expect((await admin.client.post(`/api/admin/users/${NONEXISTENT_UUID}/suspend`)).status).toBe(404);
    expect((await admin.client.post("/api/admin/users/bad/suspend")).status).toBe(404);
  });

  test("reports whose content is already gone drop out of the queue", async () => {
    const { admin, alice, bob } = await world();
    const post = await createPost(bob.client);
    await report(alice, "post", post._id);
    await bob.client.delete(`/api/posts/${post._id}`);
    expect((await admin.client.get("/api/admin/reports")).body).toEqual([]);
  });

  test("the signed-in account says whether you're an admin", async () => {
    const { admin, alice } = await world();
    expect((await admin.client.get("/api/auth/me")).body.isAdmin).toBe(true);
    expect((await alice.client.get("/api/auth/me")).body.isAdmin).toBe(false);
  });
});
