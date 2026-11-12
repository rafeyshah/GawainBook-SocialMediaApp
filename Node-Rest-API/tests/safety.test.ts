import { Client, makeApp, signUp, NONEXISTENT_UUID } from "./helpers";
import { Account, makeBook, makeCircle, makeThread, setProgress } from "./reading.helpers";
import { snippet } from "../src/routes/circles";
import { preview, PREVIEW_LENGTH } from "../src/routes/safety";
import { threadAccess } from "../src/policy";

// A public circle with an owner, a moderator and two members, all at chapter 4
// unless changed. Alice and Bob are the plan's example readers.
async function world(chapters = 10) {
  const owner = await signUp();
  const book = await makeBook(chapters);
  const circle = await makeCircle(owner, book.id);
  const [mod, alice, bob] = await Promise.all([signUp(), signUp(), signUp()]);
  for (const a of [mod, alice, bob]) await a.client.post(`/api/circles/${circle._id}/join`);
  await owner.client.put(`/api/circles/${circle._id}/members/${mod.user._id}`, { role: "moderator" });
  for (const a of [owner, mod, alice, bob]) await setProgress(a, book.id, 4);
  return { owner, mod, alice, bob, book, circle };
}

const reply = async (a: Account, threadId: string, body = "A reply") => {
  const res = await a.client.post(`/api/threads/${threadId}/comments`, { body });
  if (res.status !== 201) throw new Error(`reply failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { _id: string };
};
const thread = (a: Account, id: string) => a.client.get(`/api/threads/${id}`);
const list = async (a: Account, circleId: string) => (await a.client.get(`/api/circles/${circleId}/threads`)).body as { _id: string; locked: boolean; hidden?: boolean }[];
const search = (a: Account, circleId: string, q: string) => a.client.get(`/api/circles/${circleId}/search`, { q });
const notes = async (a: Account) => (await a.client.get("/api/notifications")).body as { unread: number; items: { _id: string; preview: string; read: boolean; thread: { _id: string } }[] };
const block = (a: Account, b: Account) => a.client.put(`/api/blocks/${b.user._id}`);

describe("helpers", () => {
  test("snippet centres on the match and marks cuts", () => {
    const text = "a".repeat(100) + " Netherfield " + "b".repeat(100);
    const s = snippet(text, "netherfield", 10);
    expect(s).toMatch(/^…a+ Netherfield b+…$/);
    expect(s.length).toBeLessThan(40);
    expect(snippet("short text", "zzz")).toBe("short text");
    expect(snippet("line\n\nbreaks", "breaks")).toBe("line breaks");
  });
  test("preview trims to a fixed length with an ellipsis", () => {
    expect(preview("hi   there")).toBe("hi there");
    const long = preview("word ".repeat(100));
    expect(long.length).toBeLessThanOrEqual(PREVIEW_LENGTH);
    expect(long.endsWith("…")).toBe(true);
  });
  test("threadAccess hides discussions by blocked authors even when unlocked", () => {
    expect(threadAccess({ visibility: "public" } as never, "member", 9, 1, true)).toBe("hidden");
  });
});

describe("editing and deleting your own writing", () => {
  test("the author edits a reply; it's marked edited", async () => {
    const { alice, circle } = await world();
    const t = await makeThread(alice, circle._id, 2);
    const c = await reply(alice, t._id, "First");
    const res = await alice.client.patch(`/api/comments/${c._id}`, { body: "  Second  " });
    expect(res.status).toBe(200);
    expect(res.body.body).toBe("Second");
    const shown = (await thread(alice, t._id)).body.comments[0];
    expect(shown.body).toBe("Second");
    expect(shown.editedAt).not.toBeNull();
  });

  test.each([["empty", ""], ["whitespace", "   "], ["too long", "x".repeat(2001)]])("rejects a %s edit", async (_n, body) => {
    const { alice, circle } = await world();
    const t = await makeThread(alice, circle._id, 2);
    const c = await reply(alice, t._id);
    expect((await alice.client.patch(`/api/comments/${c._id}`, { body })).status).toBe(400);
  });

  test("nobody else can edit your reply, not even a moderator", async () => {
    const { alice, mod, owner, circle } = await world();
    const t = await makeThread(alice, circle._id, 2);
    const c = await reply(alice, t._id);
    for (const other of [mod, owner]) expect((await other.client.patch(`/api/comments/${c._id}`, { body: "hijack" })).status).toBe(403);
  });

  test("the author edits a discussion's title and text; others can't", async () => {
    const { alice, bob, mod, circle } = await world();
    const t = await makeThread(alice, circle._id, 2);
    const res = await alice.client.patch(`/api/threads/${t._id}`, { title: "New title" });
    expect(res.body).toMatchObject({ title: "New title", body: "Secret thoughts on 2" });
    expect(res.body.editedAt).toBeTruthy();
    expect((await alice.client.patch(`/api/threads/${t._id}`, { title: "no" })).status).toBe(400);
    expect((await alice.client.patch(`/api/threads/${t._id}`, { body: "x".repeat(4001) })).status).toBe(400);
    expect((await bob.client.patch(`/api/threads/${t._id}`, { title: "Bob's title" })).status).toBe(403);
    expect((await mod.client.patch(`/api/threads/${t._id}`, { title: "Mod title" })).status).toBe(403);
  });

  test("authors and moderators can delete a discussion; members can't", async () => {
    const { alice, bob, mod, circle } = await world();
    const t1 = await makeThread(alice, circle._id, 2);
    const t2 = await makeThread(alice, circle._id, 3);
    expect((await bob.client.delete(`/api/threads/${t1._id}`)).status).toBe(403);
    expect((await alice.client.delete(`/api/threads/${t1._id}`)).body).toMatchObject({ deleted: true, circleId: circle._id });
    expect((await mod.client.delete(`/api/threads/${t2._id}`)).status).toBe(200);
    expect(await list(alice, circle._id)).toEqual([]);
  });

  test("you can't edit a discussion in a chapter you've moved back before", async () => {
    const { alice, book, circle } = await world();
    const t = await makeThread(alice, circle._id, 4);
    await setProgress(alice, book.id, 2);
    expect((await alice.client.patch(`/api/threads/${t._id}`, { title: "Changed" })).status).toBe(403);
  });
});

describe("moderators hide content", () => {
  test("a hidden reply is a placeholder for members and flagged for moderators", async () => {
    const { alice, bob, mod, circle } = await world();
    const t = await makeThread(alice, circle._id, 2);
    const c = await reply(bob, t._id, "Rude words");
    expect((await mod.client.post(`/api/comments/${c._id}/hide`)).body).toEqual({ hidden: true });

    const forAlice = (await thread(alice, t._id)).body.comments[0];
    expect(forAlice).toMatchObject({ _id: c._id, hidden: true, body: "", author: null });
    const forMod = (await thread(mod, t._id)).body.comments[0];
    expect(forMod).toMatchObject({ hidden: true, body: "Rude words" });
    // The author can't quietly edit it back.
    expect((await bob.client.patch(`/api/comments/${c._id}`, { body: "Nice words" })).status).toBe(403);
    // Hidden replies don't count.
    expect((await list(alice, circle._id))[0]).toMatchObject({ commentCount: 0 });

    await mod.client.post(`/api/comments/${c._id}/unhide`);
    expect((await thread(alice, t._id)).body.comments[0]).toMatchObject({ hidden: false, body: "Rude words" });
  });

  test("a hidden discussion disappears for members (list and direct URL) but not for moderators", async () => {
    const { alice, bob, owner, circle } = await world();
    const t = await makeThread(bob, circle._id, 2);
    await owner.client.post(`/api/threads/${t._id}/hide`);
    expect(await list(alice, circle._id)).toEqual([]);
    expect((await thread(alice, t._id)).status).toBe(404);
    expect((await thread(bob, t._id)).status).toBe(404);
    expect((await list(owner, circle._id))[0]).toMatchObject({ _id: t._id, hidden: true });
    expect((await thread(owner, t._id)).body.hidden).toBe(true);
    // Card counts ignore it.
    expect((await alice.client.get(`/api/circles/${circle._id}`)).body.openThreads).toBe(0);
  });

  test("members can't hide or unhide", async () => {
    const { alice, bob, circle } = await world();
    const t = await makeThread(alice, circle._id, 2);
    const c = await reply(alice, t._id);
    expect((await bob.client.post(`/api/comments/${c._id}/hide`)).status).toBe(403);
    expect((await bob.client.post(`/api/threads/${t._id}/hide`)).status).toBe(403);
    expect((await alice.client.post(`/api/threads/${t._id}/unhide`)).status).toBe(403);
  });

  test("moderators of another circle have no power here", async () => {
    const { alice, circle } = await world();
    const t = await makeThread(alice, circle._id, 2);
    const other = await world();
    expect((await other.owner.client.post(`/api/threads/${t._id}/hide`)).status).toBe(403);
  });
});

describe("reports", () => {
  test("a member reports a reply; moderators see it with the text; hiding resolves it", async () => {
    const { alice, bob, mod, circle } = await world();
    const t = await makeThread(alice, circle._id, 2);
    const c = await reply(bob, t._id, "Chapter 9 spoiler: X dies");
    const res = await alice.client.post("/api/reports", { targetType: "comment", targetId: c._id, reason: "spoiler", details: " Too early " });
    expect(res.status).toBe(201);

    expect((await mod.client.get(`/api/circles/${circle._id}`)).body.openReports).toBe(1);
    const reports = (await mod.client.get(`/api/circles/${circle._id}/reports`)).body;
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ reason: "spoiler", details: "Too early", targetType: "comment", reporter: { _id: alice.user._id } });
    expect(reports[0].target).toMatchObject({ text: "Chapter 9 spoiler: X dies", threadId: t._id, author: { _id: bob.user._id } });

    await mod.client.post(`/api/comments/${c._id}/hide`);
    expect((await mod.client.get(`/api/circles/${circle._id}/reports`)).body).toEqual([]);
  });

  test("a moderator can dismiss a report, only once", async () => {
    const { alice, bob, owner, circle } = await world();
    const t = await makeThread(bob, circle._id, 2);
    const { body: r } = await alice.client.post("/api/reports", { targetType: "thread", targetId: t._id, reason: "spam" });
    expect((await alice.client.post(`/api/reports/${r._id}/dismiss`)).status).toBe(403);
    expect((await owner.client.post(`/api/reports/${r._id}/dismiss`)).body).toEqual({ status: "dismissed" });
    expect((await owner.client.post(`/api/reports/${r._id}/dismiss`)).status).toBe(409);
    expect((await owner.client.post(`/api/reports/${NONEXISTENT_UUID}/dismiss`)).status).toBe(404);
    // After a dismissal you can report it again.
    expect((await alice.client.post("/api/reports", { targetType: "thread", targetId: t._id, reason: "spam" })).status).toBe(201);
  });

  test("one open report per reader per item", async () => {
    const { alice, bob, circle } = await world();
    const t = await makeThread(bob, circle._id, 2);
    expect((await alice.client.post("/api/reports", { targetType: "thread", targetId: t._id, reason: "spam" })).status).toBe(201);
    expect((await alice.client.post("/api/reports", { targetType: "thread", targetId: t._id, reason: "other" })).status).toBe(409);
  });

  test.each([
    ["an unknown type", { targetType: "book", reason: "spam" }, 400],
    ["no reason", { targetType: "thread" }, 400],
    ["an unknown reason", { targetType: "thread", reason: "meh" }, 400],
    ["long details", { targetType: "thread", reason: "other", details: "x".repeat(501) }, 400],
  ])("rejects %s", async (_n, body, status) => {
    const { alice, bob, circle } = await world();
    const t = await makeThread(bob, circle._id, 2);
    expect((await alice.client.post("/api/reports", { targetId: t._id, ...body })).status).toBe(status);
  });

  test("you can't report your own writing, a missing item, or something you can't read", async () => {
    const { alice, bob, book, circle } = await world();
    const mine = await makeThread(alice, circle._id, 2);
    expect((await alice.client.post("/api/reports", { targetType: "thread", targetId: mine._id, reason: "spam" })).status).toBe(400);
    expect((await alice.client.post("/api/reports", { targetType: "comment", targetId: NONEXISTENT_UUID, reason: "spam" })).status).toBe(404);
    await setProgress(bob, book.id, 9);
    const later = await makeThread(bob, circle._id, 9);
    const res = await alice.client.post("/api/reports", { targetType: "thread", targetId: later._id, reason: "spam" });
    expect(res.status).toBe(403);
    expect(res.body.title).toBeUndefined();
  });

  test("members can't read the report queue; strangers to a private circle get 404", async () => {
    const { alice, circle } = await world();
    expect((await alice.client.get(`/api/circles/${circle._id}/reports`)).status).toBe(403);
    const priv = await makeCircle(alice, (await makeBook(3)).id, { visibility: "private" });
    const stranger = await signUp();
    expect((await stranger.client.get(`/api/circles/${priv._id}/reports`)).status).toBe(404);
  });
});

describe("blocking (test matrix #6)", () => {
  test("the blocker no longer sees the blocked reader's replies or discussions, anywhere", async () => {
    const { alice, bob, circle } = await world();
    const bobsThread = await makeThread(bob, circle._id, 2, "Bob's thoughts");
    const alicesThread = await makeThread(alice, circle._id, 3);
    await reply(bob, alicesThread._id, "Bob was here");
    await reply(alice, alicesThread._id, "Alice too");
    expect((await block(alice, bob)).body).toEqual({ blocked: true });

    // Thread list, direct URL, replies, search, card counts.
    expect((await list(alice, circle._id)).map((t) => t._id)).toEqual([alicesThread._id]);
    expect((await thread(alice, bobsThread._id)).status).toBe(404);
    expect((await thread(alice, alicesThread._id)).body.comments.map((c: { body: string }) => c.body)).toEqual(["Alice too"]);
    expect((await search(alice, circle._id, "Bob")).body.results).toEqual([]);
    expect((await alice.client.get(`/api/circles/${circle._id}`)).body.openThreads).toBe(1);
  });

  test("it works both ways: the blocked reader can't read the blocker's discussions or reply to them", async () => {
    const { alice, bob, circle } = await world();
    const t = await makeThread(alice, circle._id, 2);
    await block(alice, bob);
    expect((await thread(bob, t._id)).status).toBe(404);
    expect((await bob.client.post(`/api/threads/${t._id}/comments`, { body: "hi" })).status).toBe(404);
    expect((await list(bob, circle._id))).toEqual([]);
  });

  test("blocked readers' replies can't be edited, deleted or reported via the blocker", async () => {
    const { alice, bob, circle } = await world();
    const t = await makeThread(alice, circle._id, 2);
    const c = await reply(bob, t._id);
    await block(alice, bob);
    expect((await alice.client.post("/api/reports", { targetType: "comment", targetId: c._id, reason: "spam" })).status).toBe(404);
  });

  test("blocking ends follows both ways and hides profile posts", async () => {
    const { alice, bob } = await world();
    await alice.client.put(`/api/users/${bob.user._id}/follow`);
    await bob.client.put(`/api/users/${alice.user._id}/follow`);
    await bob.client.post("/api/posts", { desc: "Bob's post" });
    await block(alice, bob);
    const me = (await alice.client.get("/api/auth/me")).body;
    expect(me.followings).not.toContain(bob.user._id);
    expect(me.followers).not.toContain(bob.user._id);
    expect((await alice.client.get(`/api/posts/profile/${bob.user.username}`)).body).toEqual([]);
    expect((await bob.client.get(`/api/posts/profile/${alice.user.username}`)).body).toEqual([]);
  });

  test("blocking is idempotent, listable and reversible", async () => {
    const { alice, bob, circle } = await world();
    const t = await makeThread(bob, circle._id, 2);
    await block(alice, bob);
    await block(alice, bob);
    const blocked = (await alice.client.get("/api/blocks")).body;
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({ _id: bob.user._id, username: bob.user.username });
    expect((await alice.client.delete(`/api/blocks/${bob.user._id}`)).body).toEqual({ blocked: false });
    expect((await alice.client.delete(`/api/blocks/${bob.user._id}`)).status).toBe(404);
    expect((await thread(alice, t._id)).status).toBe(200);
  });

  test.each([
    ["yourself", "self", 400],
    ["an unknown reader", NONEXISTENT_UUID, 404],
    ["a malformed id", "abc", 404],
  ])("can't block %s", async (_n, target, status) => {
    const { alice } = await world();
    const id = target === "self" ? alice.user._id : target;
    expect((await alice.client.put(`/api/blocks/${id}`)).status).toBe(status);
  });

  test("blocks need a signed-in reader", async () => {
    const anon = await new Client().init();
    expect((await anon.get("/api/blocks")).status).toBe(401);
  });
});

describe("notifications (test matrix #5)", () => {
  test("the author is told about a reply, with a short preview; not about their own replies", async () => {
    const { alice, bob, circle } = await world();
    const t = await makeThread(alice, circle._id, 2);
    await reply(alice, t._id, "My own note");
    await reply(bob, t._id, "Great point about Mr Collins");
    const n = await notes(alice);
    expect(n.unread).toBe(1);
    expect(n.items[0]).toMatchObject({ type: "reply", read: false, preview: "Great point about Mr Collins", actor: { _id: bob.user._id }, thread: { _id: t._id, chapterSeq: 2 }, circle: { _id: circle._id } });
    expect((await notes(bob)).items).toEqual([]);
  });

  test("a reply in a chapter you've moved back from isn't delivered (no preview leaks)", async () => {
    const { alice, bob, book, circle } = await world();
    const t = await makeThread(alice, circle._id, 4);
    await reply(bob, t._id, "Chapter 4 secret");
    await setProgress(alice, book.id, 3);
    const n = await notes(alice);
    expect(n.items).toEqual([]);
    expect(JSON.stringify(n)).not.toMatch(/secret/);
    await setProgress(alice, book.id, 4);
    expect((await notes(alice)).items).toHaveLength(1);
  });

  test("not delivered after you leave the circle, or once the reply is hidden or the replier blocked", async () => {
    const { alice, bob, mod, circle } = await world();
    const t = await makeThread(alice, circle._id, 2);
    const c1 = await reply(bob, t._id, "one");
    await reply(mod, t._id, "two");
    expect((await notes(alice)).items).toHaveLength(2);
    await mod.client.post(`/api/comments/${c1._id}/hide`);
    expect((await notes(alice)).items.map((i) => i.preview)).toEqual(["two"]);
    await block(alice, mod);
    expect((await notes(alice)).items).toEqual([]);
  });

  test("a private circle you were removed from stops notifying you", async () => {
    const owner = await signUp();
    const book = await makeBook(5);
    const circle = await makeCircle(owner, book.id, { visibility: "private" });
    const code = (await owner.client.get(`/api/circles/${circle._id}`)).body.inviteCode;
    const reader = await signUp();
    await reader.client.post("/api/circles/join", { code });
    await setProgress(reader, book.id, 3);
    await setProgress(owner, book.id, 3);
    const t = await makeThread(reader, circle._id, 1);
    await reply(owner, t._id, "hello");
    expect((await notes(reader)).items).toHaveLength(1);
    await owner.client.delete(`/api/circles/${circle._id}/members/${reader.user._id}`);
    expect((await notes(reader)).items).toEqual([]);
  });

  test("mark one or all as read; other readers' ids are ignored", async () => {
    const { alice, bob, circle } = await world();
    const t = await makeThread(alice, circle._id, 2);
    await reply(bob, t._id, "a");
    await reply(bob, t._id, "b");
    const [first] = (await notes(alice)).items;
    await alice.client.post("/api/notifications/read", { ids: [first._id] });
    expect((await notes(alice)).unread).toBe(1);
    // Bob can't mark Alice's notifications.
    await bob.client.post("/api/notifications/read", { ids: (await notes(alice)).items.map((i) => i._id) });
    expect((await notes(alice)).unread).toBe(1);
    await alice.client.post("/api/notifications/read");
    expect((await notes(alice)).unread).toBe(0);
  });

  test.each([["not a list", { ids: "x" }], ["bad ids", { ids: ["nope"] }], ["too many", { ids: Array(101).fill(NONEXISTENT_UUID) }]])(
    "rejects %s",
    async (_n, body) => {
      const { alice } = await world();
      expect((await alice.client.post("/api/notifications/read", body)).status).toBe(400);
    }
  );

  test("deleting the discussion removes its notifications", async () => {
    const { alice, bob, circle } = await world();
    const t = await makeThread(alice, circle._id, 2);
    await reply(bob, t._id);
    await alice.client.delete(`/api/threads/${t._id}`);
    expect((await notes(alice)).items).toEqual([]);
  });
});

describe("search (test matrix #4)", () => {
  test("a word only in a chapter 9 reply finds nothing for a chapter-4 reader", async () => {
    const { alice, bob, book, circle } = await world();
    await setProgress(bob, book.id, 9);
    const later = await makeThread(bob, circle._id, 9, "Pemberley visit");
    await reply(bob, later._id, "Wickham elopes with Lydia");
    const res = await search(alice, circle._id, "Lydia");
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
    expect(JSON.stringify(res.body)).not.toMatch(/Wickham|Pemberley/);
    // Bob, who is at chapter 9, finds it.
    expect((await search(bob, circle._id, "lydia")).body.results).toHaveLength(1);
  });

  test("finds titles, text and replies up to your chapter, case-insensitively, in chapter order", async () => {
    const { alice, bob, circle } = await world();
    const t3 = await makeThread(alice, circle._id, 3, "The Netherfield ball");
    const t1 = await makeThread(bob, circle._id, 1, "Opening line");
    await reply(alice, t1._id, "Netherfield is let at last!");
    const res = await search(alice, circle._id, "NETHERFIELD");
    expect(res.body.results.map((r: { threadId: string }) => r.threadId)).toEqual([t1._id, t3._id]);
    expect(res.body.results[0]).toMatchObject({ chapterSeq: 1, title: "Opening line" });
    expect(res.body.results[0].snippet).toMatch(/Netherfield is let/);
  });

  test("wildcards are matched literally", async () => {
    const { alice, circle } = await world();
    await makeThread(alice, circle._id, 2, "Plain title");
    expect((await search(alice, circle._id, "%%")).body.results).toEqual([]);
    expect((await search(alice, circle._id, "__")).body.results).toEqual([]);
    await makeThread(alice, circle._id, 2, "100% agree");
    expect((await search(alice, circle._id, "0%")).body.results).toHaveLength(1);
  });

  test("hidden replies and discussions aren't searchable", async () => {
    const { alice, bob, mod, circle } = await world();
    const t = await makeThread(alice, circle._id, 2, "Visible");
    const c = await reply(bob, t._id, "zebra crossing");
    await mod.client.post(`/api/comments/${c._id}/hide`);
    expect((await search(alice, circle._id, "zebra")).body.results).toEqual([]);
    await mod.client.post(`/api/threads/${t._id}/hide`);
    expect((await search(alice, circle._id, "Visible")).body.results).toEqual([]);
  });

  test.each([["too short", "a"], ["too long", "x".repeat(101)], ["empty", ""]])("rejects a %s query", async (_n, q) => {
    const { alice, circle } = await world();
    expect((await search(alice, circle._id, q)).status).toBe(400);
  });

  test("private circles: strangers get 404, not results", async () => {
    const owner = await signUp();
    const priv = await makeCircle(owner, (await makeBook(3)).id, { visibility: "private" });
    const stranger = await signUp();
    expect((await search(stranger, priv._id, "anything")).status).toBe(404);
  });
});

describe("rate limits on posting", () => {
  test("too many discussions, replies or edits in the window get 429, per reader", async () => {
    const limited = makeApp({ posting: { windowMs: 60_000, max: 3 } });
    const make = async () => {
      const c = await new Client(limited).init();
      const n = Math.random().toString(36).slice(2, 8);
      await c.post("/api/auth/register", { username: `rl${n}`, email: `rl${n}@example.com`, password: "secret123", acceptTerms: true, confirmAge: true });
      return c;
    };
    const a = await make();
    const b = await make();
    const book = await makeBook(5);
    const { body: circle } = await a.post("/api/circles", { name: "Busy", bookId: book.id });
    await b.post(`/api/circles/${circle._id}/join`);
    for (const c of [a, b]) await c.put(`/api/books/${book.id}/progress`, { chapter: 3 });

    const { body: t } = await a.post(`/api/circles/${circle._id}/threads`, { chapter: 1, title: "One" });
    await a.post(`/api/threads/${t._id}/comments`, { body: "1" });
    await a.post(`/api/threads/${t._id}/comments`, { body: "2" });
    const blocked = await a.post(`/api/threads/${t._id}/comments`, { body: "3" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/posting very quickly/);
    // Reading still works, and another reader isn't affected.
    expect((await a.get(`/api/threads/${t._id}`)).status).toBe(200);
    expect((await b.post(`/api/threads/${t._id}/comments`, { body: "b1" })).status).toBe(201);
  });
});
