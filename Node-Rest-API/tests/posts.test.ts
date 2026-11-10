import { app, request, createUser, createPost, NONEXISTENT_ID, NONEXISTENT_UUID } from "./helpers";
import { IMAGE_KEY } from "../src/routes/posts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const like = (postId: string, userId?: string) => request(app).put(`/api/posts/${postId}/like`).send({ userId });

describe("IMAGE_KEY", () => {
  test.each(["uploads/123-abc.png", "uploads/a_b-c.jpeg", "legacy-name.jpg"])("accepts %p", (k) => expect(IMAGE_KEY.test(k)).toBe(true));
  test.each(["../secret.png", "uploads/../x.png", "/etc/passwd", "uploads/a/b.png", "a b.png", ""])("rejects %p", (k) =>
    expect(IMAGE_KEY.test(k)).toBe(false)
  );
});

describe("POST /api/posts", () => {
  test("creates a text post and trims it", async () => {
    const a = await createUser();
    const res = await request(app).post("/api/posts").send({ userId: a._id, desc: "  Loved it  " });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ userId: a._id, desc: "Loved it", likes: [] });
    expect(res.body).not.toHaveProperty("img");
  });

  test("allows a photo-only post with an uploaded key", async () => {
    const a = await createUser();
    const res = await request(app).post("/api/posts").send({ userId: a._id, img: "uploads/123-abc.jpg" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ img: "uploads/123-abc.jpg", desc: "" });
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

  test("accepts exactly 500 characters, including multi-byte characters", async () => {
    const a = await createUser();
    expect((await request(app).post("/api/posts").send({ userId: a._id, desc: "x".repeat(500) })).status).toBe(201);
    expect((await request(app).post("/api/posts").send({ userId: a._id, desc: "é".repeat(500) })).status).toBe(201);
  });

  test("stores text exactly, including quotes and SQL-looking input", async () => {
    const a = await createUser();
    const desc = `Robert'); DROP TABLE posts;-- "quoted" <b>html</b>`;
    const res = await request(app).post("/api/posts").send({ userId: a._id, desc });
    expect(res.body.desc).toBe(desc);
    expect((await request(app).get(`/api/posts/${res.body._id}`)).body.desc).toBe(desc);
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
    expect((await like(post._id, a._id)).body).toEqual({ liked: true, likes: 1 });
    expect((await like(post._id, a._id)).body).toEqual({ liked: false, likes: 0 });
  });

  test("counts likes from different readers separately", async () => {
    const a = await createUser();
    const b = await createUser();
    const post = await createPost(a._id);
    await like(post._id, a._id);
    expect((await like(post._id, b._id)).body).toEqual({ liked: true, likes: 2 });
    expect((await request(app).get(`/api/posts/${post._id}`)).body.likes.sort()).toEqual([a._id, b._id].sort());
  });

  test("a liker that doesn't exist is rejected", async () => {
    const a = await createUser();
    const post = await createPost(a._id);
    expect((await like(post._id, NONEXISTENT_UUID)).status).toBe(404);
  });

  test("handles unknown posts and missing user ids", async () => {
    const a = await createUser();
    const post = await createPost(a._id);
    expect((await like(NONEXISTENT_ID, a._id)).status).toBe(404);
    expect((await like("nope", a._id)).status).toBe(404);
    expect((await like(post._id)).status).toBe(400);
  });
});

describe("edit and delete", () => {
  test("the author can edit and delete their post", async () => {
    const a = await createUser();
    const post = await createPost(a._id);
    const edit = await request(app).put(`/api/posts/${post._id}`).send({ userId: a._id, desc: "Updated" });
    expect(edit.status).toBe(200);
    expect(edit.body.desc).toBe("Updated");
    expect(new Date(edit.body.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(post.updatedAt).getTime());
    expect((await request(app).delete(`/api/posts/${post._id}`).send({ userId: a._id })).status).toBe(200);
    expect((await request(app).get(`/api/posts/${post._id}`)).status).toBe(404);
  });

  test("deleting a post removes its likes", async () => {
    const a = await createUser();
    const post = await createPost(a._id);
    await like(post._id, a._id);
    await request(app).delete(`/api/posts/${post._id}`).send({ userId: a._id });
    const again = await createPost(a._id);
    expect((await like(again._id, a._id)).body).toEqual({ liked: true, likes: 1 });
  });

  test("other readers can't edit or delete it", async () => {
    const a = await createUser();
    const b = await createUser();
    const post = await createPost(a._id);
    expect((await request(app).put(`/api/posts/${post._id}`).send({ userId: b._id, desc: "x" })).status).toBe(403);
    expect((await request(app).delete(`/api/posts/${post._id}`).send({ userId: b._id })).status).toBe(403);
  });

  test("editing to empty text is rejected, unless the post has a photo", async () => {
    const a = await createUser();
    const textPost = await createPost(a._id);
    const photoPost = await createPost(a._id, { desc: "caption", img: "uploads/1-a.png" });
    expect((await request(app).put(`/api/posts/${textPost._id}`).send({ userId: a._id, desc: " " })).status).toBe(400);
    expect((await request(app).put(`/api/posts/${photoPost._id}`).send({ userId: a._id, desc: "" })).status).toBe(200);
  });

  test("unknown posts return 404", async () => {
    const a = await createUser();
    expect((await request(app).put(`/api/posts/${NONEXISTENT_ID}`).send({ userId: a._id, desc: "x" })).status).toBe(404);
    expect((await request(app).delete(`/api/posts/${NONEXISTENT_UUID}`).send({ userId: a._id })).status).toBe(404);
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
    expect(res.body.map((p: { desc: string }) => p.desc)).toEqual(["friend (newest)", "mine (oldest)"]);
  });

  test("unfollowing removes that reader's posts from your timeline", async () => {
    const me = await createUser();
    const friend = await createUser();
    await request(app).put(`/api/users/${friend._id}/follow`).send({ userId: me._id });
    await createPost(friend._id, { desc: "hello" });
    expect((await request(app).get(`/api/posts/timeline/${me._id}`)).body).toHaveLength(1);
    await request(app).put(`/api/users/${friend._id}/unfollow`).send({ userId: me._id });
    expect((await request(app).get(`/api/posts/timeline/${me._id}`)).body).toEqual([]);
  });

  test("timeline is empty for a new reader", async () => {
    const me = await createUser();
    expect((await request(app).get(`/api/posts/timeline/${me._id}`)).body).toEqual([]);
  });

  test("profile feed lists only that reader's posts, newest first", async () => {
    const a = await createUser({ username: "alice" });
    const b = await createUser();
    await createPost(a._id, { desc: "first" });
    await wait(15);
    await createPost(a._id, { desc: "second" });
    await createPost(b._id, { desc: "not alice" });
    const res = await request(app).get("/api/posts/profile/alice");
    expect(res.body.map((p: { desc: string }) => p.desc)).toEqual(["second", "first"]);
  });

  test("feeds return 404 for unknown readers", async () => {
    expect((await request(app).get(`/api/posts/timeline/${NONEXISTENT_ID}`)).status).toBe(404);
    expect((await request(app).get("/api/posts/timeline/bad")).status).toBe(404);
    expect((await request(app).get("/api/posts/profile/ghost")).status).toBe(404);
  });
});
