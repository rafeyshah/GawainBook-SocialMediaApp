const { app, request, createUser, createPost, NONEXISTENT_ID } = require("./helpers");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe("POST /api/posts", () => {
  test("creates a text post and trims it", async () => {
    const a = await createUser();
    const res = await request(app).post("/api/posts").send({ userId: a._id, desc: "  Loved it  " });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ userId: a._id, desc: "Loved it", likes: [] });
  });

  test("allows a photo-only post", async () => {
    const a = await createUser();
    const res = await request(app).post("/api/posts").send({ userId: a._id, img: "123-abc.jpg" });
    expect(res.status).toBe(201);
    expect(res.body.img).toBe("123-abc.jpg");
  });

  test.each([
    ["empty text and no photo", { desc: "   " }, /Write something/],
    ["text over 500 characters", { desc: "x".repeat(501) }, /at most 500/],
    ["an image path with directories", { img: "../secret.png" }, /Invalid image/],
  ])("rejects %s", async (_name, body, message) => {
    const a = await createUser();
    const res = await request(app).post("/api/posts").send({ userId: a._id, ...body });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });

  test("accepts exactly 500 characters", async () => {
    const a = await createUser();
    const res = await request(app).post("/api/posts").send({ userId: a._id, desc: "x".repeat(500) });
    expect(res.status).toBe(201);
  });

  test("rejects a missing or unknown author", async () => {
    expect((await request(app).post("/api/posts").send({ desc: "hi" })).status).toBe(400);
    expect((await request(app).post("/api/posts").send({ userId: NONEXISTENT_ID, desc: "hi" })).status).toBe(404);
  });
});

describe("PUT /api/posts/:id/like", () => {
  test("toggles like and unlike, returning the new count", async () => {
    const a = await createUser();
    const post = await createPost(a._id);
    const like = await request(app).put(`/api/posts/${post._id}/like`).send({ userId: a._id });
    expect(like.body).toEqual({ liked: true, likes: 1 });
    const unlike = await request(app).put(`/api/posts/${post._id}/like`).send({ userId: a._id });
    expect(unlike.body).toEqual({ liked: false, likes: 0 });
  });

  test("counts likes from different readers separately", async () => {
    const a = await createUser();
    const b = await createUser();
    const post = await createPost(a._id);
    await request(app).put(`/api/posts/${post._id}/like`).send({ userId: a._id });
    const res = await request(app).put(`/api/posts/${post._id}/like`).send({ userId: b._id });
    expect(res.body).toEqual({ liked: true, likes: 2 });
  });

  test("handles unknown posts and missing user ids", async () => {
    const a = await createUser();
    const post = await createPost(a._id);
    expect((await request(app).put(`/api/posts/${NONEXISTENT_ID}/like`).send({ userId: a._id })).status).toBe(404);
    expect((await request(app).put("/api/posts/nope/like").send({ userId: a._id })).status).toBe(404);
    expect((await request(app).put(`/api/posts/${post._id}/like`).send({})).status).toBe(400);
  });
});

describe("edit and delete", () => {
  test("the author can edit and delete their post", async () => {
    const a = await createUser();
    const post = await createPost(a._id);
    const edit = await request(app).put(`/api/posts/${post._id}`).send({ userId: a._id, desc: "Updated" });
    expect(edit.status).toBe(200);
    expect(edit.body.desc).toBe("Updated");
    const del = await request(app).delete(`/api/posts/${post._id}`).send({ userId: a._id });
    expect(del.status).toBe(200);
    expect((await request(app).get(`/api/posts/${post._id}`)).status).toBe(404);
  });

  test("other readers can't edit or delete it", async () => {
    const a = await createUser();
    const b = await createUser();
    const post = await createPost(a._id);
    expect((await request(app).put(`/api/posts/${post._id}`).send({ userId: b._id, desc: "x" })).status).toBe(403);
    expect((await request(app).delete(`/api/posts/${post._id}`).send({ userId: b._id })).status).toBe(403);
  });

  test("editing to empty text is rejected", async () => {
    const a = await createUser();
    const post = await createPost(a._id);
    const res = await request(app).put(`/api/posts/${post._id}`).send({ userId: a._id, desc: " " });
    expect(res.status).toBe(400);
  });

  test("unknown posts return 404", async () => {
    const a = await createUser();
    expect((await request(app).put(`/api/posts/${NONEXISTENT_ID}`).send({ userId: a._id, desc: "x" })).status).toBe(404);
    expect((await request(app).delete(`/api/posts/${NONEXISTENT_ID}`).send({ userId: a._id })).status).toBe(404);
  });
});

describe("feeds", () => {
  test("timeline has your posts and posts from people you follow, newest first", async () => {
    const me = await createUser();
    const friend = await createUser();
    const stranger = await createUser();
    await request(app).put(`/api/users/${friend._id}/follow`).send({ userId: me._id });

    await createPost(me._id, { desc: "mine (oldest)" });
    await wait(15);
    await createPost(stranger._id, { desc: "stranger" });
    await wait(15);
    await createPost(friend._id, { desc: "friend (newest)" });

    const res = await request(app).get(`/api/posts/timeline/${me._id}`);
    expect(res.status).toBe(200);
    expect(res.body.map((p) => p.desc)).toEqual(["friend (newest)", "mine (oldest)"]);
  });

  test("timeline is empty for a new reader", async () => {
    const me = await createUser();
    const res = await request(app).get(`/api/posts/timeline/${me._id}`);
    expect(res.body).toEqual([]);
  });

  test("profile feed lists only that reader's posts, newest first", async () => {
    const a = await createUser({ username: "alice" });
    const b = await createUser();
    await createPost(a._id, { desc: "first" });
    await wait(15);
    await createPost(a._id, { desc: "second" });
    await createPost(b._id, { desc: "not alice" });
    const res = await request(app).get("/api/posts/profile/alice");
    expect(res.body.map((p) => p.desc)).toEqual(["second", "first"]);
  });

  test("feeds return 404 for unknown readers", async () => {
    expect((await request(app).get(`/api/posts/timeline/${NONEXISTENT_ID}`)).status).toBe(404);
    expect((await request(app).get("/api/posts/timeline/bad")).status).toBe(404);
    expect((await request(app).get("/api/posts/profile/ghost")).status).toBe(404);
  });
});
