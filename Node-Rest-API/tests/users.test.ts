import { app, request, createUser, createPost, NONEXISTENT_ID, NONEXISTENT_UUID } from "./helpers";

const follow = (targetId: string, userId?: string) => request(app).put(`/api/users/${targetId}/follow`).send({ userId });
const unfollow = (targetId: string, userId?: string) => request(app).put(`/api/users/${targetId}/unfollow`).send({ userId });
const getUser = (query: object) => request(app).get("/api/users").query(query);

describe("GET /api/users", () => {
  test("finds a user by username or id without private fields", async () => {
    const jane = await createUser({ username: "jane" });
    for (const query of [{ username: "jane" }, { userId: jane._id }]) {
      const res = await getUser(query);
      expect(res.status).toBe(200);
      expect(res.body.username).toBe("jane");
      for (const secret of ["password", "passwordHash", "email", "isAdmin"]) expect(res.body).not.toHaveProperty(secret);
    }
  });

  test("username lookup is exact (no partial or case-insensitive match)", async () => {
    await createUser({ username: "jane" });
    expect((await getUser({ username: "Jane" })).status).toBe(404);
    expect((await getUser({ username: "jan" })).status).toBe(404);
  });

  test.each([
    ["unknown username", { username: "ghost" }],
    ["unknown ObjectId-style id", { userId: NONEXISTENT_ID }],
    ["unknown UUID", { userId: NONEXISTENT_UUID }],
    ["malformed id", { userId: "not-an-id" }],
    ["SQL in the id", { userId: "1' or '1'='1" }],
    ["no query", {}],
  ])("returns 404 for %s", async (_name, query) => {
    expect((await getUser(query)).status).toBe(404);
  });
});

describe("follow / unfollow", () => {
  let a: Awaited<ReturnType<typeof createUser>>;
  let b: Awaited<ReturnType<typeof createUser>>;
  beforeEach(async () => {
    a = await createUser();
    b = await createUser();
  });

  test("following updates both users", async () => {
    const res = await follow(b._id, a._id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ following: true });
    expect((await getUser({ userId: b._id })).body.followers).toEqual([a._id]);
    expect((await getUser({ userId: a._id })).body.followings).toEqual([b._id]);
  });

  test("following twice is rejected and does not duplicate", async () => {
    await follow(b._id, a._id);
    expect((await follow(b._id, a._id)).status).toBe(409);
    expect((await getUser({ userId: b._id })).body.followers).toHaveLength(1);
  });

  test("two simultaneous follow requests create one follow", async () => {
    const results = await Promise.all([follow(b._id, a._id), follow(b._id, a._id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await getUser({ userId: b._id })).body.followers).toHaveLength(1);
  });

  test("unfollowing removes the link on both sides", async () => {
    await follow(b._id, a._id);
    const res = await unfollow(b._id, a._id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ following: false });
    expect((await getUser({ userId: b._id })).body.followers).toEqual([]);
    expect((await getUser({ userId: a._id })).body.followings).toEqual([]);
  });

  test("follows are one-directional", async () => {
    await follow(b._id, a._id);
    expect((await getUser({ userId: a._id })).body.followers).toEqual([]);
  });

  test("unfollowing someone you don't follow is rejected", async () => {
    expect((await unfollow(b._id, a._id)).status).toBe(409);
  });

  test("you can't follow or unfollow yourself", async () => {
    expect((await follow(a._id, a._id)).status).toBe(403);
    expect((await unfollow(a._id, a._id)).status).toBe(403);
  });

  test.each([
    ["unknown target", () => [NONEXISTENT_ID, a._id], 404],
    ["unknown UUID target", () => [NONEXISTENT_UUID, a._id], 404],
    ["malformed target", () => ["bad-id", a._id], 404],
    ["unknown follower", () => [b._id, NONEXISTENT_ID], 404],
    ["missing follower id", () => [b._id, undefined], 400],
  ])("handles %s", async (_name, args, status) => {
    const [target, me] = (args as () => [string, string | undefined])();
    expect((await follow(target, me)).status).toBe(status);
  });
});

describe("GET /api/users/friends/:userId", () => {
  test("lists the people a user follows (alphabetically) with public fields only", async () => {
    const a = await createUser();
    const zoe = await createUser({ username: "zoe" });
    const bob = await createUser({ username: "bob" });
    await follow(zoe._id, a._id);
    await follow(bob._id, a._id);
    const res = await request(app).get(`/api/users/friends/${a._id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { _id: bob._id, username: "bob", profilePicture: "" },
      { _id: zoe._id, username: "zoe", profilePicture: "" },
    ]);
  });

  test("returns an empty list for someone who follows nobody", async () => {
    const a = await createUser();
    expect((await request(app).get(`/api/users/friends/${a._id}`)).body).toEqual([]);
  });

  test("deleted accounts disappear from friend lists (cascade)", async () => {
    const a = await createUser();
    const b = await createUser();
    await follow(b._id, a._id);
    await request(app).delete(`/api/users/${b._id}`).send({ userId: b._id });
    const res = await request(app).get(`/api/users/friends/${a._id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("returns 404 for unknown or malformed ids", async () => {
    expect((await request(app).get(`/api/users/friends/${NONEXISTENT_ID}`)).status).toBe(404);
    expect((await request(app).get("/api/users/friends/xyz")).status).toBe(404);
  });
});

describe("PUT /api/users/:id", () => {
  test("updates allowed profile fields", async () => {
    const a = await createUser();
    const res = await request(app)
      .put(`/api/users/${a._id}`)
      .send({ userId: a._id, desc: "Fantasy fan", city: "Lahore", from: "Karachi", relationship: 2 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ desc: "Fantasy fan", city: "Lahore", from: "Karachi", relationship: 2 });
  });

  test("ignores fields that must not be self-edited (isAdmin, followers, email, username)", async () => {
    const a = await createUser({ email: "a@example.com" });
    await request(app)
      .put(`/api/users/${a._id}`)
      .send({ userId: a._id, isAdmin: true, followers: ["x"], email: "evil@example.com", username: "admin" });
    const login = await request(app).post("/api/auth/login").send({ email: "a@example.com", password: "secret123" });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ isAdmin: false, followers: [], username: a.username });
  });

  test("changes the password (hashed) so the new one works and the old one doesn't", async () => {
    const a = await createUser({ email: "pw@example.com" });
    await request(app).put(`/api/users/${a._id}`).send({ userId: a._id, password: "newpass99" });
    const oldPw = await request(app).post("/api/auth/login").send({ email: "pw@example.com", password: "secret123" });
    const newPw = await request(app).post("/api/auth/login").send({ email: "pw@example.com", password: "newpass99" });
    expect(oldPw.status).toBe(401);
    expect(newPw.status).toBe(200);
  });

  test.each([
    ["a too-short new password", { password: "123" }],
    ["an invalid relationship value", { relationship: 9 }],
    ["a non-numeric relationship", { relationship: "married" }],
    ["a bio over 200 characters", { desc: "x".repeat(201) }],
  ])("rejects %s with 400", async (_name, body) => {
    const a = await createUser();
    expect((await request(app).put(`/api/users/${a._id}`).send({ userId: a._id, ...body })).status).toBe(400);
  });

  test("forbids editing someone else's account", async () => {
    const a = await createUser();
    const b = await createUser();
    expect((await request(app).put(`/api/users/${b._id}`).send({ userId: a._id, desc: "hacked" })).status).toBe(403);
  });

  test("returns 404 for an account that doesn't exist", async () => {
    const res = await request(app).put(`/api/users/${NONEXISTENT_UUID}`).send({ userId: NONEXISTENT_UUID, desc: "x" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/users/:id", () => {
  test("deletes your account and everything that belongs to it", async () => {
    const a = await createUser();
    const b = await createUser();
    await follow(b._id, a._id);
    const post = await createPost(a._id);
    await request(app).put(`/api/posts/${(await createPost(b._id))._id}/like`).send({ userId: a._id });

    const res = await request(app).delete(`/api/users/${a._id}`).send({ userId: a._id });
    expect(res.status).toBe(200);
    expect((await getUser({ userId: a._id })).status).toBe(404);
    expect((await getUser({ userId: b._id })).body.followers).toEqual([]);
    expect((await request(app).get(`/api/posts/${post._id}`)).status).toBe(404);
    expect((await request(app).get(`/api/posts/profile/${b.username}`)).body[0].likes).toEqual([]);
  });

  test("forbids deleting someone else's account", async () => {
    const a = await createUser();
    const b = await createUser();
    expect((await request(app).delete(`/api/users/${b._id}`).send({ userId: a._id })).status).toBe(403);
  });

  test("deleting twice returns 404 the second time", async () => {
    const a = await createUser();
    await request(app).delete(`/api/users/${a._id}`).send({ userId: a._id });
    expect((await request(app).delete(`/api/users/${a._id}`).send({ userId: a._id })).status).toBe(404);
  });
});
