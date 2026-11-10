import { signUp, createPost, newClient, NONEXISTENT_ID, NONEXISTENT_UUID } from "./helpers";

type Account = Awaited<ReturnType<typeof signUp>>;

describe("GET /api/users", () => {
  test("finds a user by username or id without private fields", async () => {
    const jane = await signUp({ username: "jane" });
    for (const query of [{ username: "jane" }, { userId: jane.user._id }]) {
      const res = await jane.client.get("/api/users", query);
      expect(res.status).toBe(200);
      expect(res.body.username).toBe("jane");
      for (const secret of ["password", "passwordHash", "email", "isAdmin"]) expect(res.body).not.toHaveProperty(secret);
    }
  });

  test("username lookup is exact", async () => {
    const { client } = await signUp({ username: "jane" });
    expect((await client.get("/api/users", { username: "Jane" })).status).toBe(404);
    expect((await client.get("/api/users", { username: "jan" })).status).toBe(404);
  });

  test.each([
    ["unknown username", { username: "ghost" }],
    ["unknown ObjectId-style id", { userId: NONEXISTENT_ID }],
    ["unknown UUID", { userId: NONEXISTENT_UUID }],
    ["malformed id", { userId: "not-an-id" }],
    ["SQL in the id", { userId: "1' or '1'='1" }],
    ["no query", {}],
  ])("returns 404 for %s", async (_name, query) => {
    const { client } = await signUp();
    expect((await client.get("/api/users", query)).status).toBe(404);
  });
});

describe("follow / unfollow", () => {
  let a: Account;
  let b: Account;
  beforeEach(async () => {
    a = await signUp();
    b = await signUp();
  });
  const profile = (who: Account, of: Account) => who.client.get("/api/users", { userId: of.user._id }).then((r) => r.body);

  test("following updates both users", async () => {
    const res = await a.client.put(`/api/users/${b.user._id}/follow`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ following: true });
    expect((await profile(a, b)).followers).toEqual([a.user._id]);
    expect((await profile(a, a)).followings).toEqual([b.user._id]);
  });

  test("following twice is rejected and does not duplicate", async () => {
    await a.client.put(`/api/users/${b.user._id}/follow`);
    expect((await a.client.put(`/api/users/${b.user._id}/follow`)).status).toBe(409);
    expect((await profile(a, b)).followers).toHaveLength(1);
  });

  test("two simultaneous follow requests create one follow", async () => {
    const results = await Promise.all([a.client.put(`/api/users/${b.user._id}/follow`), a.client.put(`/api/users/${b.user._id}/follow`)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  test("unfollowing removes the link on both sides", async () => {
    await a.client.put(`/api/users/${b.user._id}/follow`);
    const res = await a.client.put(`/api/users/${b.user._id}/unfollow`);
    expect(res.body).toEqual({ following: false });
    expect((await profile(a, b)).followers).toEqual([]);
    expect((await profile(a, a)).followings).toEqual([]);
  });

  test("follows are one-directional", async () => {
    await a.client.put(`/api/users/${b.user._id}/follow`);
    expect((await profile(a, a)).followers).toEqual([]);
  });

  test("unfollowing someone you don't follow is rejected", async () => {
    expect((await a.client.put(`/api/users/${b.user._id}/unfollow`)).status).toBe(409);
  });

  test("you can't follow or unfollow yourself", async () => {
    expect((await a.client.put(`/api/users/${a.user._id}/follow`)).status).toBe(403);
    expect((await a.client.put(`/api/users/${a.user._id}/unfollow`)).status).toBe(403);
  });

  test.each([NONEXISTENT_ID, NONEXISTENT_UUID, "bad-id"])("following unknown target %p is 404", async (target) => {
    expect((await a.client.put(`/api/users/${target}/follow`)).status).toBe(404);
  });
});

describe("GET /api/users/friends/:userId", () => {
  test("lists the people a user follows (alphabetically) with public fields only", async () => {
    const a = await signUp();
    const zoe = await signUp({ username: "zoe" });
    const bob = await signUp({ username: "bob" });
    await a.client.put(`/api/users/${zoe.user._id}/follow`);
    await a.client.put(`/api/users/${bob.user._id}/follow`);
    const res = await a.client.get(`/api/users/friends/${a.user._id}`);
    expect(res.body).toEqual([
      { _id: bob.user._id, username: "bob", profilePicture: "" },
      { _id: zoe.user._id, username: "zoe", profilePicture: "" },
    ]);
  });

  test("returns an empty list for someone who follows nobody", async () => {
    const a = await signUp();
    expect((await a.client.get(`/api/users/friends/${a.user._id}`)).body).toEqual([]);
  });

  test("deleted accounts disappear from friend lists (cascade)", async () => {
    const a = await signUp();
    const b = await signUp();
    await a.client.put(`/api/users/${b.user._id}/follow`);
    await b.client.delete(`/api/users/${b.user._id}`);
    expect((await a.client.get(`/api/users/friends/${a.user._id}`)).body).toEqual([]);
  });

  test("returns 404 for unknown or malformed ids", async () => {
    const a = await signUp();
    expect((await a.client.get(`/api/users/friends/${NONEXISTENT_ID}`)).status).toBe(404);
    expect((await a.client.get("/api/users/friends/xyz")).status).toBe(404);
  });
});

describe("PUT /api/users/:id", () => {
  test("updates allowed profile fields", async () => {
    const a = await signUp();
    const res = await a.client.put(`/api/users/${a.user._id}`, { desc: "Fantasy fan", city: "Lahore", from: "Karachi", relationship: 2 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ desc: "Fantasy fan", city: "Lahore", from: "Karachi", relationship: 2 });
  });

  test("ignores fields that must not be self-edited (isAdmin, followers, email, username)", async () => {
    const a = await signUp({ email: "a@example.com" });
    await a.client.put(`/api/users/${a.user._id}`, { isAdmin: true, followers: ["x"], email: "evil@example.com", username: "admin" });
    const me = (await a.client.get("/api/auth/me")).body;
    expect(me).toMatchObject({ isAdmin: false, followers: [], username: a.user.username, email: "a@example.com" });
  });

  test("changes the password so the new one works and the old one doesn't", async () => {
    const a = await signUp({ email: "pw@example.com" });
    await a.client.put(`/api/users/${a.user._id}`, { password: "newpass99" });
    const c = await newClient();
    expect((await c.post("/api/auth/login", { email: "pw@example.com", password: "secret123" })).status).toBe(401);
    expect((await c.post("/api/auth/login", { email: "pw@example.com", password: "newpass99" })).status).toBe(200);
  });

  test.each([
    ["a too-short new password", { password: "123" }],
    ["a too-long new password", { password: "a".repeat(73) }],
    ["an invalid relationship value", { relationship: 9 }],
    ["a non-numeric relationship", { relationship: "married" }],
    ["a bio over 200 characters", { desc: "x".repeat(201) }],
  ])("rejects %s with 400", async (_name, body) => {
    const a = await signUp();
    expect((await a.client.put(`/api/users/${a.user._id}`, body)).status).toBe(400);
  });
});

describe("DELETE /api/users/:id", () => {
  test("deletes your account and everything that belongs to it", async () => {
    const a = await signUp();
    const b = await signUp();
    await a.client.put(`/api/users/${b.user._id}/follow`);
    const post = await createPost(a.client);
    const bPost = await createPost(b.client);
    await a.client.put(`/api/posts/${bPost._id}/like`);

    expect((await a.client.delete(`/api/users/${a.user._id}`)).status).toBe(200);
    expect((await b.client.get("/api/users", { userId: a.user._id })).status).toBe(404);
    expect((await b.client.get("/api/users", { userId: b.user._id })).body.followers).toEqual([]);
    expect((await b.client.get(`/api/posts/${post._id}`)).status).toBe(404);
    expect((await b.client.get(`/api/posts/${bPost._id}`)).body.likes).toEqual([]);
  });
});
