const { app, request, createUser, NONEXISTENT_ID } = require("./helpers");

const follow = (targetId, userId) => request(app).put(`/api/users/${targetId}/follow`).send({ userId });
const unfollow = (targetId, userId) => request(app).put(`/api/users/${targetId}/unfollow`).send({ userId });
const getUser = (query) => request(app).get("/api/users").query(query);

describe("GET /api/users", () => {
  test("finds a user by username or id without private fields", async () => {
    const jane = await createUser({ username: "jane" });
    for (const query of [{ username: "jane" }, { userId: jane._id }]) {
      const res = await getUser(query);
      expect(res.status).toBe(200);
      expect(res.body.username).toBe("jane");
      expect(res.body).not.toHaveProperty("password");
      expect(res.body).not.toHaveProperty("email");
      expect(res.body).not.toHaveProperty("isAdmin");
    }
  });

  test.each([
    ["unknown username", { username: "ghost" }],
    ["unknown id", { userId: NONEXISTENT_ID }],
    ["malformed id", { userId: "not-an-id" }],
    ["no query", {}],
  ])("returns 404 for %s", async (_name, query) => {
    const res = await getUser(query);
    expect(res.status).toBe(404);
  });
});

describe("follow / unfollow", () => {
  let a;
  let b;
  beforeEach(async () => {
    a = await createUser();
    b = await createUser();
  });

  test("following updates both users", async () => {
    const res = await follow(b._id, a._id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ following: true });

    const target = (await getUser({ userId: b._id })).body;
    const me = (await getUser({ userId: a._id })).body;
    expect(target.followers).toEqual([a._id]);
    expect(me.followings).toEqual([b._id]);
  });

  test("following twice is rejected and does not duplicate", async () => {
    await follow(b._id, a._id);
    const res = await follow(b._id, a._id);
    expect(res.status).toBe(409);
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

  test("unfollowing someone you don't follow is rejected", async () => {
    expect((await unfollow(b._id, a._id)).status).toBe(409);
  });

  test("you can't follow or unfollow yourself", async () => {
    expect((await follow(a._id, a._id)).status).toBe(403);
    expect((await unfollow(a._id, a._id)).status).toBe(403);
  });

  test.each([
    ["unknown target", () => [NONEXISTENT_ID, a._id], 404],
    ["malformed target", () => ["bad-id", a._id], 404],
    ["unknown follower", () => [b._id, NONEXISTENT_ID], 404],
    ["missing follower id", () => [b._id, undefined], 400],
  ])("handles %s", async (_name, args, status) => {
    const [target, me] = args();
    expect((await follow(target, me)).status).toBe(status);
  });
});

describe("GET /api/users/friends/:userId", () => {
  test("lists the people a user follows with public fields only", async () => {
    const a = await createUser();
    const b = await createUser({ username: "bob" });
    await follow(b._id, a._id);
    const res = await request(app).get(`/api/users/friends/${a._id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ _id: b._id, username: "bob", profilePicture: "" }]);
  });

  test("returns an empty list for someone who follows nobody", async () => {
    const a = await createUser();
    const res = await request(app).get(`/api/users/friends/${a._id}`);
    expect(res.body).toEqual([]);
  });

  test("skips deleted accounts instead of crashing", async () => {
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
      .send({ userId: a._id, desc: "Fantasy fan", city: "Lahore" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ desc: "Fantasy fan", city: "Lahore" });
  });

  test("ignores fields that must not be self-edited (isAdmin, followers, email)", async () => {
    const a = await createUser({ email: "a@example.com" });
    await request(app)
      .put(`/api/users/${a._id}`)
      .send({ userId: a._id, isAdmin: true, followers: ["x"], email: "evil@example.com" });
    const login = await request(app).post("/api/auth/login").send({ email: "a@example.com", password: "secret123" });
    expect(login.status).toBe(200);
    expect(login.body.isAdmin).toBe(false);
    expect(login.body.followers).toEqual([]);
  });

  test("changes the password (hashed) so the new one works and the old one doesn't", async () => {
    const a = await createUser({ email: "pw@example.com" });
    await request(app).put(`/api/users/${a._id}`).send({ userId: a._id, password: "newpass99" });
    const oldPw = await request(app).post("/api/auth/login").send({ email: "pw@example.com", password: "secret123" });
    const newPw = await request(app).post("/api/auth/login").send({ email: "pw@example.com", password: "newpass99" });
    expect(oldPw.status).toBe(401);
    expect(newPw.status).toBe(200);
  });

  test("rejects a too-short new password", async () => {
    const a = await createUser();
    const res = await request(app).put(`/api/users/${a._id}`).send({ userId: a._id, password: "123" });
    expect(res.status).toBe(400);
  });

  test("forbids editing someone else's account", async () => {
    const a = await createUser();
    const b = await createUser();
    const res = await request(app).put(`/api/users/${b._id}`).send({ userId: a._id, desc: "hacked" });
    expect(res.status).toBe(403);
  });

  test("rejects an invalid relationship value", async () => {
    const a = await createUser();
    const res = await request(app).put(`/api/users/${a._id}`).send({ userId: a._id, relationship: 9 });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/users/:id", () => {
  test("deletes your own account and removes you from others' lists", async () => {
    const a = await createUser();
    const b = await createUser();
    await follow(b._id, a._id);
    const res = await request(app).delete(`/api/users/${a._id}`).send({ userId: a._id });
    expect(res.status).toBe(200);
    expect((await getUser({ userId: a._id })).status).toBe(404);
    expect((await getUser({ userId: b._id })).body.followers).toEqual([]);
  });

  test("forbids deleting someone else's account", async () => {
    const a = await createUser();
    const b = await createUser();
    const res = await request(app).delete(`/api/users/${b._id}`).send({ userId: a._id });
    expect(res.status).toBe(403);
  });
});
