import { signUp, NONEXISTENT_UUID } from "./helpers";
import { Account, makeBook, makeCircle, makeThread, setProgress } from "./reading.helpers";
import { canModerate, canPost, canSeeCircle, threadAccess } from "../src/policy";

describe("policy rules", () => {
  const pub = { visibility: "public" };
  const priv = { visibility: "private" };
  test.each([
    [pub, null, 5, 3, "open"],
    [pub, null, 2, 3, "locked"],
    [priv, null, 99, 1, "hidden"],
    [priv, "member", 3, 3, "open"],
    [priv, "member", 2, 3, "locked"],
    [pub, "owner", 0, 0, "open"],
  ] as const)("%o role=%p progress=%p chapter=%p → %p", (circle, role, progress, chapter, expected) => {
    expect(threadAccess(circle as never, role, progress, chapter)).toBe(expected);
  });
  test("canSeeCircle / canPost / canModerate", () => {
    expect(canSeeCircle({ visibility: "private" } as never, null)).toBe(false);
    expect(canPost(null)).toBe(false);
    expect(canPost("member")).toBe(true);
    expect(canModerate("member")).toBe(false);
    expect(canModerate("moderator")).toBe(true);
    expect(canModerate("owner")).toBe(true);
  });
});

describe("creating circles", () => {
  test("creates a circle, makes you owner and puts the book on your reading shelf", async () => {
    const a = await signUp();
    const book = await makeBook(10);
    const res = await a.client.post("/api/circles", { name: "  Night Owls  ", bookId: book.id, schedule: "2 a week", description: "Hi" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Night Owls", myRole: "owner", memberCount: 1, visibility: "public", schedule: "2 a week" });
    expect((await a.client.get(`/api/books/${book.id}`)).body.shelf).toBe("reading");
  });

  test.each([
    ["a short name", { name: "ab" }],
    ["a long name", { name: "x".repeat(61) }],
    ["a bad visibility", { visibility: "secret" }],
    ["no book", { bookId: undefined }],
    ["an unknown book", { bookId: NONEXISTENT_UUID }],
    ["a long description", { description: "x".repeat(501) }],
  ])("rejects %s", async (_name, change) => {
    const a = await signUp();
    const book = await makeBook(3);
    expect((await a.client.post("/api/circles", { name: "Good Name", bookId: book.id, ...change })).status).toBe(400);
  });

  test("every circle gets its own unguessable invite code", async () => {
    const a = await signUp();
    const book = await makeBook(3);
    const c1 = await makeCircle(a, book.id, { visibility: "private" });
    const c2 = await makeCircle(a, book.id, { visibility: "private" });
    const code1 = (await a.client.get(`/api/circles/${c1._id}`)).body.inviteCode;
    const code2 = (await a.client.get(`/api/circles/${c2._id}`)).body.inviteCode;
    expect(code1).toMatch(/^[\w-]{12}$/);
    expect(code1).not.toBe(code2);
  });
});

describe("joining, leaving and visibility", () => {
  let owner: Account;
  let reader: Account;
  let bookId: string;
  beforeEach(async () => {
    owner = await signUp();
    reader = await signUp();
    bookId = (await makeBook(10)).id;
  });

  test("anyone can join a public circle; joining twice is a 409", async () => {
    const c = await makeCircle(owner, bookId);
    expect((await reader.client.post(`/api/circles/${c._id}/join`)).status).toBe(201);
    expect((await reader.client.post(`/api/circles/${c._id}/join`)).status).toBe(409);
    expect((await reader.client.get(`/api/circles/${c._id}`)).body).toMatchObject({ myRole: "member", memberCount: 2 });
  });

  test("a private circle is invisible to non-members everywhere (matrix #1)", async () => {
    const c = await makeCircle(owner, bookId, { visibility: "private" });
    await makeThread(owner, c._id, 0, "Intro chat");
    expect((await reader.client.get(`/api/circles/${c._id}`)).status).toBe(404);
    expect((await reader.client.get(`/api/circles/${c._id}/threads`)).status).toBe(404);
    expect((await reader.client.post(`/api/circles/${c._id}/join`)).status).toBe(404);
    const lists = (await reader.client.get("/api/circles")).body;
    expect([...lists.mine, ...lists.discover].map((x: { _id: string }) => x._id)).not.toContain(c._id);
  });

  test("a private circle can be joined with its invite code", async () => {
    const c = await makeCircle(owner, bookId, { visibility: "private" });
    const code = (await owner.client.get(`/api/circles/${c._id}`)).body.inviteCode;
    expect((await reader.client.post("/api/circles/join", { code: "wrong-code-xx" })).status).toBe(404);
    expect((await reader.client.post("/api/circles/join", { code })).body).toEqual({ circleId: c._id });
    expect((await reader.client.get(`/api/circles/${c._id}`)).status).toBe(200);
  });

  test("only owners and moderators see the invite code", async () => {
    const c = await makeCircle(owner, bookId);
    await reader.client.post(`/api/circles/${c._id}/join`);
    expect((await reader.client.get(`/api/circles/${c._id}`)).body.inviteCode).toBeUndefined();
  });

  test("members see each other's chapter; visitors to a public circle don't", async () => {
    const c = await makeCircle(owner, bookId);
    await setProgress(owner, bookId, 4);
    const visitorView = (await reader.client.get(`/api/circles/${c._id}`)).body.members[0];
    expect(visitorView).not.toHaveProperty("chapter");
    await reader.client.post(`/api/circles/${c._id}/join`);
    const memberView = (await reader.client.get(`/api/circles/${c._id}`)).body.members.find((m: { role: string }) => m.role === "owner");
    expect(memberView.chapter).toBe(4);
  });

  test("leaving: members can, owners can't, non-members get 409", async () => {
    const c = await makeCircle(owner, bookId);
    expect((await reader.client.post(`/api/circles/${c._id}/leave`)).status).toBe(409);
    await reader.client.post(`/api/circles/${c._id}/join`);
    expect((await reader.client.post(`/api/circles/${c._id}/leave`)).status).toBe(200);
    expect((await owner.client.post(`/api/circles/${c._id}/leave`)).status).toBe(403);
  });

  test("a removed member loses access to a private circle immediately (matrix #7)", async () => {
    const c = await makeCircle(owner, bookId, { visibility: "private" });
    const code = (await owner.client.get(`/api/circles/${c._id}`)).body.inviteCode;
    await reader.client.post("/api/circles/join", { code });
    const t = await makeThread(owner, c._id, 0, "Welcome");
    expect((await reader.client.get(`/api/threads/${t._id}`)).status).toBe(200);
    await reader.client.post(`/api/circles/${c._id}/leave`);
    expect((await reader.client.get(`/api/threads/${t._id}`)).status).toBe(404);
  });

  test("GET /api/circles splits your circles from ones to discover", async () => {
    const mine = await makeCircle(owner, bookId, { name: "Mine" });
    const other = await makeCircle(reader, bookId, { name: "Theirs" });
    const res = await owner.client.get("/api/circles");
    expect(res.body.mine.map((c: { _id: string }) => c._id)).toEqual([mine._id]);
    expect(res.body.discover.map((c: { _id: string }) => c._id)).toEqual([other._id]);
  });
});

describe("spoiler-safe discussions", () => {
  let owner: Account;
  let reader: Account;
  let bookId: string;
  let circleId: string;
  beforeEach(async () => {
    owner = await signUp();
    reader = await signUp();
    bookId = (await makeBook(10)).id;
    circleId = (await makeCircle(owner, bookId))._id;
    await reader.client.post(`/api/circles/${circleId}/join`);
    await setProgress(owner, bookId, 10);
  });

  test("the thread list hides title, author and text past your chapter (matrix #3)", async () => {
    await makeThread(owner, circleId, 2, "Early chat");
    await makeThread(owner, circleId, 9, "The big twist");
    await setProgress(reader, bookId, 4);
    const list = (await reader.client.get(`/api/circles/${circleId}/threads`)).body;
    expect(list[0]).toMatchObject({ chapterSeq: 2, title: "Early chat", locked: false });
    expect(list[1]).toEqual({ _id: expect.any(String), chapterSeq: 9, locked: true });
    expect(JSON.stringify(list)).not.toMatch(/big twist/);
  });

  test("opening a later thread directly is 403 with no content (matrix #2)", async () => {
    const t = await makeThread(owner, circleId, 9, "The big twist");
    await setProgress(reader, bookId, 4);
    const res = await reader.client.get(`/api/threads/${t._id}`);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ locked: true, chapterSeq: 9 });
    expect(JSON.stringify(res.body)).not.toMatch(/big twist|Secret thoughts/);
  });

  test("you can't read or post replies on a locked thread", async () => {
    const t = await makeThread(owner, circleId, 9);
    await setProgress(reader, bookId, 4);
    expect((await reader.client.post(`/api/threads/${t._id}/comments`, { body: "hi" })).status).toBe(403);
  });

  test("reaching the chapter unlocks it; going back locks it again (matrix #8)", async () => {
    const t = await makeThread(owner, circleId, 9, "Ch 9");
    await setProgress(reader, bookId, 9);
    expect((await reader.client.get(`/api/threads/${t._id}`)).status).toBe(200);
    await setProgress(reader, bookId, 3);
    expect((await reader.client.get(`/api/threads/${t._id}`)).status).toBe(403);
  });

  test("chapter 0 (before chapter 1) is open to everyone, ordering uses seq (matrix #9)", async () => {
    await makeThread(owner, circleId, 3, "Three");
    await makeThread(owner, circleId, 0, "Hello everyone");
    const list = (await reader.client.get(`/api/circles/${circleId}/threads`)).body;
    expect(list.map((t: { chapterSeq: number }) => t.chapterSeq)).toEqual([0, 3]);
    expect(list[0].locked).toBe(false);
  });

  test("you can't start a discussion beyond your own chapter", async () => {
    await setProgress(reader, bookId, 4);
    const res = await reader.client.post(`/api/circles/${circleId}/threads`, { chapter: 5, title: "Peeking ahead" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Reach chapter 5/);
  });

  test.each([
    ["chapter past the end", { chapter: 11, title: "Valid title" }],
    ["chapter as text", { chapter: "2", title: "Valid title" }],
    ["short title", { chapter: 1, title: "Hi" }],
    ["long text", { chapter: 1, title: "Valid title", body: "x".repeat(4001) }],
  ])("rejects a thread with %s", async (_name, body) => {
    expect((await owner.client.post(`/api/circles/${circleId}/threads`, body)).status).toBe(400);
  });

  test("non-members can read open threads of a public circle but can't post (matrix #10)", async () => {
    const visitor = await signUp();
    const t = await makeThread(owner, circleId, 0, "Open intro");
    expect((await visitor.client.get(`/api/threads/${t._id}`)).body.canReply).toBe(false);
    expect((await visitor.client.post(`/api/threads/${t._id}/comments`, { body: "hi" })).status).toBe(403);
    expect((await visitor.client.post(`/api/circles/${circleId}/threads`, { chapter: 0, title: "Mine now" })).status).toBe(403);
  });

  test("replies: post, read back in order, validate", async () => {
    const t = await makeThread(owner, circleId, 1);
    await setProgress(reader, bookId, 1);
    await reader.client.post(`/api/threads/${t._id}/comments`, { body: "First!" });
    await owner.client.post(`/api/threads/${t._id}/comments`, { body: "Second" });
    const thread = (await reader.client.get(`/api/threads/${t._id}`)).body;
    expect(thread.comments.map((c: { body: string }) => c.body)).toEqual(["First!", "Second"]);
    expect(thread).toMatchObject({ chapterSeq: 1, chapterTitle: "Chapter 1", canReply: true });
    expect((await reader.client.post(`/api/threads/${t._id}/comments`, { body: "  " })).status).toBe(400);
    expect((await reader.client.post(`/api/threads/${t._id}/comments`, { body: "x".repeat(2001) })).status).toBe(400);
  });

  test("delete replies: your own yes, others' no, moderators yes", async () => {
    const t = await makeThread(owner, circleId, 0);
    const mine = (await reader.client.post(`/api/threads/${t._id}/comments`, { body: "mine" })).body;
    const ownerReply = (await owner.client.post(`/api/threads/${t._id}/comments`, { body: "owner's" })).body;
    expect((await reader.client.delete(`/api/comments/${ownerReply._id}`)).status).toBe(403);
    expect((await reader.client.delete(`/api/comments/${mine._id}`)).status).toBe(200);
    const again = (await reader.client.post(`/api/threads/${t._id}/comments`, { body: "again" })).body;
    expect((await owner.client.delete(`/api/comments/${again._id}`)).status).toBe(200);
  });

  test("progress is read from the database, never from the request", async () => {
    const t = await makeThread(owner, circleId, 9);
    await setProgress(reader, bookId, 1);
    const res = await reader.client.agent.get(`/api/threads/${t._id}?progress=99&chapter=99`);
    expect(res.status).toBe(403);
  });

  test("the circle card counts open and locked discussions for you", async () => {
    await makeThread(owner, circleId, 1);
    await makeThread(owner, circleId, 8);
    await setProgress(reader, bookId, 3);
    const card = (await reader.client.get(`/api/circles/${circleId}`)).body;
    expect(card).toMatchObject({ openThreads: 1, lockedThreads: 1, myProgress: 3 });
  });

  test("unknown threads and comments are 404", async () => {
    expect((await reader.client.get(`/api/threads/${NONEXISTENT_UUID}`)).status).toBe(404);
    expect((await reader.client.get("/api/threads/bad")).status).toBe(404);
    expect((await reader.client.delete(`/api/comments/${NONEXISTENT_UUID}`)).status).toBe(404);
  });
});
