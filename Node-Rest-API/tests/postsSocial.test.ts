import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { users } from "../src/db/schema";
import { spoilerFields } from "../src/routes/posts";
import { HttpError } from "../src/http";
import { Client, createPost, makeApp, newClient, signUp, NONEXISTENT_UUID, CONSENT } from "./helpers";

type Account = Awaited<ReturnType<typeof signUp>>;
const comment = (a: Account, postId: string, body = "Lovely!") => a.client.post(`/api/posts/${postId}/comments`, { body });
const comments = async (a: Account, postId: string) => (await a.client.get(`/api/posts/${postId}/comments`)).body;
const notes = async (a: Account) => (await a.client.get("/api/notifications")).body;

describe("spoilerFields", () => {
  test("defaults to no spoiler", () => expect(spoilerFields({})).toEqual({ spoiler: false, spoilerFor: null }));
  test("keeps the label tidy and drops it when not a spoiler", () => {
    expect(spoilerFields({ spoiler: true, spoilerFor: "  Pride   and Prejudice " })).toEqual({ spoiler: true, spoilerFor: "Pride and Prejudice" });
    expect(spoilerFields({ spoiler: false, spoilerFor: "Emma" })).toEqual({ spoiler: false, spoilerFor: null });
    expect(spoilerFields({ spoiler: true, spoilerFor: "   " })).toEqual({ spoiler: true, spoilerFor: null });
    expect(spoilerFields({ spoiler: true, spoilerFor: null })).toEqual({ spoiler: true, spoilerFor: null });
  });
  test("fields left out keep their current value", () => {
    expect(spoilerFields({}, { spoiler: true, spoilerFor: "Emma" })).toEqual({ spoiler: true, spoilerFor: "Emma" });
    expect(spoilerFields({ spoilerFor: "Persuasion" }, { spoiler: true, spoilerFor: "Emma" })).toEqual({ spoiler: true, spoilerFor: "Persuasion" });
    expect(spoilerFields({ spoiler: false }, { spoiler: true, spoilerFor: "Emma" })).toEqual({ spoiler: false, spoilerFor: null });
  });
  test.each([[{ spoiler: "yes" }], [{ spoiler: 1 }], [{ spoiler: true, spoilerFor: "x".repeat(81) }]])("rejects %p", (body) => {
    expect(() => spoilerFields(body)).toThrow(HttpError);
  });
});

describe("spoiler posts", () => {
  test("a post can carry a spoiler cover with the book's name", async () => {
    const a = await signUp();
    const post = await createPost(a.client, { desc: "Wickham and Lydia!", spoiler: true, spoilerFor: "Pride and Prejudice" });
    expect(post).toMatchObject({ spoiler: true, spoilerFor: "Pride and Prejudice", commentCount: 0, editedAt: null });
  });

  test("new posts aren't spoilers, and have no label, by default", async () => {
    const a = await signUp();
    expect(await createPost(a.client)).toMatchObject({ spoiler: false, spoilerFor: null });
  });

  test("invalid spoiler values are rejected", async () => {
    const a = await signUp();
    expect((await a.client.post("/api/posts", { desc: "x", spoiler: "true" })).status).toBe(400);
  });
});

describe("editing and deleting posts", () => {
  test("the author edits text and spoiler cover; the post is marked edited; the photo stays", async () => {
    const a = await signUp();
    const post = await createPost(a.client, { desc: "First", img: "uploads/1-a.png" });
    const res = await a.client.put(`/api/posts/${post._id}`, { desc: "  Second  ", spoiler: true, spoilerFor: "Emma" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ desc: "Second", spoiler: true, spoilerFor: "Emma", img: "uploads/1-a.png" });
    expect(res.body.editedAt).toBeTruthy();
  });

  test("only changing the spoiler keeps the text", async () => {
    const a = await signUp();
    const post = await createPost(a.client, { desc: "Keep me" });
    expect((await a.client.put(`/api/posts/${post._id}`, { spoiler: true })).body).toMatchObject({ desc: "Keep me", spoiler: true });
  });

  test.each([
    ["empty text without a photo", { desc: "  " }],
    ["text over 500 characters", { desc: "x".repeat(501) }],
    ["a long spoiler label", { spoiler: true, spoilerFor: "x".repeat(81) }],
  ])("rejects %s and changes nothing", async (_n, body) => {
    const a = await signUp();
    const post = await createPost(a.client, { desc: "Original" });
    expect((await a.client.put(`/api/posts/${post._id}`, body)).status).toBe(400);
    expect((await a.client.get(`/api/posts/${post._id}`)).body).toMatchObject({ desc: "Original", editedAt: null });
  });

  test("a photo post can have its text removed", async () => {
    const a = await signUp();
    const post = await createPost(a.client, { desc: "caption", img: "uploads/1-a.png" });
    expect((await a.client.put(`/api/posts/${post._id}`, { desc: "" })).body.desc).toBe("");
  });

  test("nobody else can edit or delete your post", async () => {
    const a = await signUp();
    const b = await signUp();
    const post = await createPost(a.client);
    expect((await b.client.put(`/api/posts/${post._id}`, { desc: "hijack" })).status).toBe(403);
    expect((await b.client.delete(`/api/posts/${post._id}`)).status).toBe(403);
  });

  test("deleting removes the post with its comments, likes and notifications", async () => {
    const a = await signUp();
    const b = await signUp();
    const post = await createPost(a.client);
    await comment(b, post._id);
    await b.client.put(`/api/posts/${post._id}/like`);
    expect((await notes(a)).items).toHaveLength(1);
    expect((await a.client.delete(`/api/posts/${post._id}`)).status).toBe(200);
    expect((await b.client.get(`/api/posts/${post._id}`)).status).toBe(404);
    expect((await b.client.get(`/api/posts/${post._id}/comments`)).status).toBe(404);
    expect((await notes(a)).items).toEqual([]);
  });

  test.each([["unknown", NONEXISTENT_UUID], ["malformed", "nope"]])("%s ids are 404", async (_n, id) => {
    const a = await signUp();
    expect((await a.client.put(`/api/posts/${id}`, { desc: "x" })).status).toBe(404);
    expect((await a.client.delete(`/api/posts/${id}`)).status).toBe(404);
    expect((await a.client.get(`/api/posts/${id}/comments`)).status).toBe(404);
  });
});

describe("comments on posts", () => {
  test("anyone who can see the post can comment; comments come back oldest first with authors", async () => {
    const a = await signUp();
    const b = await signUp();
    const post = await createPost(a.client);
    const first = await comment(b, post._id, "  Great pick!  ");
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ body: "Great pick!", author: { _id: b.user._id, username: b.user.username }, canDelete: true, editedAt: null });
    await comment(a, post._id, "Thanks!");
    const list = await comments(b, post._id);
    expect(list.map((c: { body: string }) => c.body)).toEqual(["Great pick!", "Thanks!"]);
    expect((await a.client.get(`/api/posts/${post._id}`)).body.commentCount).toBe(2);
  });

  test("canDelete: yes for your own comments and for any comment on your own post", async () => {
    const a = await signUp();
    const b = await signUp();
    const post = await createPost(a.client);
    await comment(b, post._id, "from b");
    await comment(a, post._id, "from a");
    const forB = await comments(b, post._id);
    expect(forB.map((c: { canDelete: boolean }) => c.canDelete)).toEqual([true, false]);
    const forA = await comments(a, post._id);
    expect(forA.map((c: { canDelete: boolean }) => c.canDelete)).toEqual([true, true]);
  });

  test.each([["empty", ""], ["whitespace", "   "], ["too long", "x".repeat(1001)], ["missing", undefined]])("rejects a %s comment", async (_n, body) => {
    const a = await signUp();
    const post = await createPost(a.client);
    expect((await a.client.post(`/api/posts/${post._id}/comments`, { body })).status).toBe(400);
  });

  test("1000 characters is fine", async () => {
    const a = await signUp();
    const post = await createPost(a.client);
    expect((await comment(a, post._id, "x".repeat(1000))).status).toBe(201);
  });

  test("the author edits their comment; it's marked edited; others can't", async () => {
    const a = await signUp();
    const b = await signUp();
    const post = await createPost(a.client);
    const { body: c } = await comment(b, post._id, "typo");
    const res = await b.client.patch(`/api/post-comments/${c._id}`, { body: "fixed" });
    expect(res.body).toMatchObject({ body: "fixed" });
    expect(res.body.editedAt).toBeTruthy();
    // Not even the post's owner can rewrite someone's words.
    expect((await a.client.patch(`/api/post-comments/${c._id}`, { body: "nope" })).status).toBe(403);
    expect((await b.client.patch(`/api/post-comments/${c._id}`, { body: "" })).status).toBe(400);
  });

  test("delete: the commenter, or the post's owner; nobody else", async () => {
    const [a, b, c] = await Promise.all([signUp(), signUp(), signUp()]);
    const post = await createPost(a.client);
    const { body: byB } = await comment(b, post._id, "b1");
    const { body: byB2 } = await comment(b, post._id, "b2");
    expect((await c.client.delete(`/api/post-comments/${byB._id}`)).status).toBe(403);
    expect((await b.client.delete(`/api/post-comments/${byB._id}`)).body).toEqual({ deleted: true });
    expect((await a.client.delete(`/api/post-comments/${byB2._id}`)).body).toEqual({ deleted: true });
    expect(await comments(a, post._id)).toEqual([]);
    expect((await b.client.delete(`/api/post-comments/${byB._id}`)).status).toBe(404);
  });

  test.each([["unknown", NONEXISTENT_UUID], ["malformed", "x"]])("%s comment ids are 404", async (_n, id) => {
    const a = await signUp();
    expect((await a.client.patch(`/api/post-comments/${id}`, { body: "x" })).status).toBe(404);
    expect((await a.client.delete(`/api/post-comments/${id}`)).status).toBe(404);
  });

  test("needs a session", async () => {
    const a = await signUp();
    const post = await createPost(a.client);
    const anon = await newClient();
    expect((await anon.get(`/api/posts/${post._id}/comments`)).status).toBe(401);
    expect((await anon.post(`/api/posts/${post._id}/comments`, { body: "hi" })).status).toBe(401);
  });
});

describe("blocking and suspension apply to posts and comments", () => {
  test("blocked either way: the post, its comments and commenting are 404", async () => {
    const a = await signUp();
    const b = await signUp();
    const post = await createPost(a.client);
    await b.client.put(`/api/blocks/${a.user._id}`);
    expect((await b.client.get(`/api/posts/${post._id}`)).status).toBe(404);
    expect((await b.client.get(`/api/posts/${post._id}/comments`)).status).toBe(404);
    expect((await comment(b, post._id)).status).toBe(404);
    expect((await b.client.put(`/api/posts/${post._id}/like`)).status).toBe(404);
    // The blocked side too.
    const bPost = await createPost(b.client);
    expect((await comment(a, bPost._id)).status).toBe(404);
  });

  test("a blocked reader's comments are hidden from you on someone else's post", async () => {
    const [owner, a, troll] = await Promise.all([signUp(), signUp(), signUp()]);
    const post = await createPost(owner.client);
    await comment(troll, post._id, "troll comment");
    await comment(owner, post._id, "owner comment");
    await a.client.put(`/api/blocks/${troll.user._id}`);
    expect((await comments(a, post._id)).map((c: { body: string }) => c.body)).toEqual(["owner comment"]);
    // …and you can't act on it.
    const trollComment = (await comments(owner, post._id)).find((c: { body: string }) => c.body === "troll comment");
    expect((await a.client.delete(`/api/post-comments/${trollComment._id}`)).status).toBe(404);
  });

  test("suspended readers' posts and comments disappear for others", async () => {
    const [owner, viewer, sus] = await Promise.all([signUp(), signUp(), signUp()]);
    const post = await createPost(owner.client);
    const susPost = await createPost(sus.client);
    await comment(sus, post._id, "from suspended");
    await getDb().update(users).set({ suspendedAt: new Date() }).where(eq(users.id, sus.user._id));
    expect(await comments(viewer, post._id)).toEqual([]);
    expect((await viewer.client.get(`/api/posts/${susPost._id}`)).status).toBe(404);
  });
});

describe("notifications for comments on your posts", () => {
  test("the post's owner is told, with a preview; not about their own comments", async () => {
    const a = await signUp();
    const b = await signUp();
    const post = await createPost(a.client, { desc: "Just finished Persuasion" });
    await comment(a, post._id, "my own");
    await comment(b, post._id, "Anne Elliot forever");
    const n = await notes(a);
    expect(n.unread).toBe(1);
    expect(n.items[0]).toMatchObject({ type: "post_comment", actor: { _id: b.user._id }, post: { _id: post._id, preview: "Just finished Persuasion" }, preview: "Anne Elliot forever" });
    expect((await notes(b)).items).toEqual([]);
  });

  test("on a spoiler post, neither the post nor the comment is previewed", async () => {
    const a = await signUp();
    const b = await signUp();
    const post = await createPost(a.client, { desc: "The big twist!", spoiler: true });
    await comment(b, post._id, "I can't believe X did Y");
    const [item] = (await notes(a)).items;
    expect(item.post.preview).toBe("");
    expect(item.preview).toBe("");
    expect(JSON.stringify(item)).not.toMatch(/twist|believe/);
  });

  test("not delivered once the comment is deleted, or the commenter blocked or suspended", async () => {
    const [a, b, c, d] = await Promise.all([signUp(), signUp(), signUp(), signUp()]);
    const post = await createPost(a.client);
    const { body: fromB } = await comment(b, post._id, "b");
    await comment(c, post._id, "c");
    await comment(d, post._id, "d");
    expect((await notes(a)).items).toHaveLength(3);
    await b.client.delete(`/api/post-comments/${fromB._id}`);
    await a.client.put(`/api/blocks/${c.user._id}`);
    await getDb().update(users).set({ suspendedAt: new Date() }).where(eq(users.id, d.user._id));
    expect((await notes(a)).items).toEqual([]);
  });

  test("discussion-reply notifications still work alongside", async () => {
    const a = await signUp();
    const b = await signUp();
    const post = await createPost(a.client);
    await comment(b, post._id);
    const n = await notes(a);
    expect(n.items.every((i: { type: string }) => ["post_comment", "reply"].includes(i.type))).toBe(true);
  });
});

describe("reporting comments", () => {
  test("a comment can be reported to admins, who can remove it", async () => {
    const [a, b, admin] = await Promise.all([signUp(), signUp(), signUp()]);
    await getDb().update(users).set({ isAdmin: true }).where(eq(users.id, admin.user._id));
    const post = await createPost(a.client);
    const { body: c } = await comment(b, post._id, "Rude comment");
    expect((await a.client.post("/api/reports", { targetType: "post_comment", targetId: c._id, reason: "harassment" })).status).toBe(201);
    expect((await b.client.post("/api/reports", { targetType: "post_comment", targetId: c._id, reason: "spam" })).status).toBe(400);
    const queue = (await admin.client.get("/api/admin/reports")).body;
    expect(queue[0]).toMatchObject({ targetType: "post_comment", target: { text: "Rude comment", postId: post._id, author: { _id: b.user._id } } });
    expect((await admin.client.delete(`/api/admin/post-comments/${c._id}`)).body).toEqual({ deleted: true });
    expect((await admin.client.get("/api/admin/reports")).body).toEqual([]);
    expect(await comments(a, post._id)).toEqual([]);
    expect((await admin.client.delete(`/api/admin/post-comments/${c._id}`)).status).toBe(404);
  });

  test("non-admins can't use the admin delete; unknown comments can't be reported", async () => {
    const a = await signUp();
    expect((await a.client.delete(`/api/admin/post-comments/${NONEXISTENT_UUID}`)).status).toBe(404);
    expect((await a.client.post("/api/reports", { targetType: "post_comment", targetId: NONEXISTENT_UUID, reason: "spam" })).status).toBe(404);
  });
});

test("posting comments and posts is rate limited per reader", async () => {
  const limited = makeApp({ posting: { windowMs: 60_000, max: 2 } });
  const c = await new Client(limited).init();
  await c.post("/api/auth/register", { username: "rlposter", email: "rlp@example.com", password: "secret123", ...CONSENT });
  const { body: post } = await c.post("/api/posts", { desc: "one" });
  expect((await c.post(`/api/posts/${post._id}/comments`, { body: "a" })).status).toBe(201);
  expect((await c.post(`/api/posts/${post._id}/comments`, { body: "b" })).status).toBe(429);
  // Reading still works.
  expect((await c.get(`/api/posts/${post._id}/comments`)).status).toBe(200);
});
