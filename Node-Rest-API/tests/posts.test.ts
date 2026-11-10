import { signUp, createPost, NONEXISTENT_ID, NONEXISTENT_UUID } from "./helpers";
import { IMAGE_KEY } from "../src/routes/posts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const descs = (body: { desc: string }[]) => body.map((p) => p.desc);

describe("IMAGE_KEY", () => {
  test.each(["uploads/123-abc.png", "uploads/a_b-c.jpeg", "legacy-name.jpg"])("accepts %p", (k) => expect(IMAGE_KEY.test(k)).toBe(true));
  test.each(["../secret.png", "uploads/../x.png", "/etc/passwd", "uploads/a/b.png", "a b.png", ""])("rejects %p", (k) =>
    expect(IMAGE_KEY.test(k)).toBe(false)
  );
});

describe("POST /api/posts", () => {
  test("creates a text post by the signed-in user and trims it", async () => {
    const a = await signUp();
    const res = await a.client.post("/api/posts", { desc: "  Loved it  " });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ userId: a.user._id, desc: "Loved it", likes: [] });
    expect(res.body).not.toHaveProperty("img");
  });

  test("allows a photo-only post", async () => {
    const a = await signUp();
    const res = await a.client.post("/api/posts", { img: "uploads/123-abc.jpg" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ img: "uploads/123-abc.jpg", desc: "" });
  });

  test.each([
    ["empty text and no photo", { desc: "   " }, /Write something/],
    ["text over 500 characters", { desc: "x".repeat(501) }, /at most 500/],
    ["an image path with directories", { img: "../secret.png" }, /Invalid image/],
  ])("rejects %s", async (_name, body, message) => {
    const a = await signUp();
    const res = await a.client.post("/api/posts", body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });

  test("accepts exactly 500 characters, including multi-byte characters", async () => {
    const a = await signUp();
    expect((await a.client.post("/api/posts", { desc: "x".repeat(500) })).status).toBe(201);
    expect((await a.client.post("/api/posts", { desc: "é".repeat(500) })).status).toBe(201);
  });

  test("stores emoji and non-Latin scripts exactly (UTF-8 end to end)", async () => {
    const a = await signUp();
    const desc = "Reading 📚✨ — Jane Austen · 傲慢与偏见 · Гордость и предубеждение · كبرياء وتحامل";
    const res = await a.client.post("/api/posts", { desc });
    expect((await a.client.get(`/api/posts/${res.body._id}`)).body.desc).toBe(desc);
  });

  test("stores text exactly, including quotes and SQL-looking input", async () => {
    const a = await signUp();
    const desc = `Robert'); DROP TABLE posts;-- "quoted" <b>html</b>`;
    const res = await a.client.post("/api/posts", { desc });
    expect((await a.client.get(`/api/posts/${res.body._id}`)).body.desc).toBe(desc);
  });
});

describe("PUT /api/posts/:id/like", () => {
  test("toggles like and unlike, returning the new count", async () => {
    const a = await signUp();
    const post = await createPost(a.client);
    expect((await a.client.put(`/api/posts/${post._id}/like`)).body).toEqual({ liked: true, likes: 1 });
    expect((await a.client.put(`/api/posts/${post._id}/like`)).body).toEqual({ liked: false, likes: 0 });
  });

  test("counts likes from different readers separately", async () => {
    const a = await signUp();
    const b = await signUp();
    const post = await createPost(a.client);
    await a.client.put(`/api/posts/${post._id}/like`);
    expect((await b.client.put(`/api/posts/${post._id}/like`)).body).toEqual({ liked: true, likes: 2 });
    expect((await a.client.get(`/api/posts/${post._id}`)).body.likes.sort()).toEqual([a.user._id, b.user._id].sort());
  });

  test("unknown posts are 404", async () => {
    const a = await signUp();
    expect((await a.client.put(`/api/posts/${NONEXISTENT_ID}/like`)).status).toBe(404);
    expect((await a.client.put("/api/posts/nope/like")).status).toBe(404);
  });
});

describe("edit and delete", () => {
  test("the author can edit and delete their post", async () => {
    const a = await signUp();
    const post = await createPost(a.client);
    const edit = await a.client.put(`/api/posts/${post._id}`, { desc: "Updated" });
    expect(edit.status).toBe(200);
    expect(edit.body.desc).toBe("Updated");
    expect((await a.client.delete(`/api/posts/${post._id}`)).status).toBe(200);
    expect((await a.client.get(`/api/posts/${post._id}`)).status).toBe(404);
  });

  test("deleting a post removes its likes", async () => {
    const a = await signUp();
    const post = await createPost(a.client);
    await a.client.put(`/api/posts/${post._id}/like`);
    await a.client.delete(`/api/posts/${post._id}`);
    const again = await createPost(a.client);
    expect((await a.client.put(`/api/posts/${again._id}/like`)).body).toEqual({ liked: true, likes: 1 });
  });

  test("editing to empty text is rejected, unless the post has a photo", async () => {
    const a = await signUp();
    const textPost = await createPost(a.client);
    const photoPost = await createPost(a.client, { desc: "caption", img: "uploads/1-a.png" });
    expect((await a.client.put(`/api/posts/${textPost._id}`, { desc: " " })).status).toBe(400);
    expect((await a.client.put(`/api/posts/${photoPost._id}`, { desc: "" })).status).toBe(200);
  });

  test("unknown posts return 404", async () => {
    const a = await signUp();
    expect((await a.client.put(`/api/posts/${NONEXISTENT_ID}`, { desc: "x" })).status).toBe(404);
    expect((await a.client.delete(`/api/posts/${NONEXISTENT_UUID}`)).status).toBe(404);
  });
});

describe("feeds", () => {
  test("timeline has your posts and posts from people you follow, newest first", async () => {
    const me = await signUp();
    const friend = await signUp();
    const stranger = await signUp();
    await me.client.put(`/api/users/${friend.user._id}/follow`);

    await createPost(me.client, { desc: "mine (oldest)" });
    await wait(15);
    await createPost(stranger.client, { desc: "stranger" });
    await wait(15);
    await createPost(friend.client, { desc: "friend (newest)" });

    const res = await me.client.get("/api/posts/timeline");
    expect(res.status).toBe(200);
    expect(descs(res.body)).toEqual(["friend (newest)", "mine (oldest)"]);
  });

  test("unfollowing removes that reader's posts from your timeline", async () => {
    const me = await signUp();
    const friend = await signUp();
    await me.client.put(`/api/users/${friend.user._id}/follow`);
    await createPost(friend.client, { desc: "hello" });
    expect((await me.client.get("/api/posts/timeline")).body).toHaveLength(1);
    await me.client.put(`/api/users/${friend.user._id}/unfollow`);
    expect((await me.client.get("/api/posts/timeline")).body).toEqual([]);
  });

  test("profile feed lists only that reader's posts, newest first", async () => {
    const a = await signUp({ username: "alice" });
    const b = await signUp();
    await createPost(a.client, { desc: "first" });
    await wait(15);
    await createPost(a.client, { desc: "second" });
    await createPost(b.client, { desc: "not alice" });
    expect(descs((await b.client.get("/api/posts/profile/alice")).body)).toEqual(["second", "first"]);
  });

  test("profile feed is 404 for unknown readers", async () => {
    const a = await signUp();
    expect((await a.client.get("/api/posts/profile/ghost")).status).toBe(404);
  });
});
