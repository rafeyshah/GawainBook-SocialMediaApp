import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { books, circleMembers, circles, comments, follows, threads, users } from "../src/db/schema";
import { BOOKS, CIRCLES, MEMBER_READING, SAMPLE_EMAIL_DOMAIN, SAMPLE_USERS } from "../src/seed/data";
import { removeDemo, sampleEmail, seedDemo } from "../src/seed/seed";
import { signUp, newClient } from "./helpers";

// Progress for a username on a book slug, as the seed defines it.
const progressOf = (name: string, slug: string, real: string[] = []) => {
  if (real.includes(name)) return MEMBER_READING[slug]?.[1] ?? 0;
  return SAMPLE_USERS.find((u) => u.username === name)?.reading[slug]?.[1] ?? 0;
};

describe("demo data is realistic and safe", () => {
  const chapterCount = (slug: string) => BOOKS.find((b) => b.slug === slug)!.chapters.length;

  test("books are the planned public-domain titles with the right chapter counts", () => {
    expect(BOOKS.map((b) => [b.slug, b.chapters.length])).toEqual([
      ["pride-and-prejudice", 61],
      ["the-wonderful-wizard-of-oz", 24],
      ["persuasion", 24],
    ]);
    for (const b of BOOKS) expect(b.publishedYear).toBeLessThan(1929);
  });

  test("usernames are valid and unique; invite codes are unique", () => {
    const names = SAMPLE_USERS.map((u) => u.username);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[\w.-]{3,20}$/);
    const codes = CIRCLES.map((c) => c.inviteCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("progress values are within each book", () => {
    for (const u of SAMPLE_USERS) {
      for (const [slug, [, ch]] of Object.entries(u.reading)) expect(ch).toBeLessThanOrEqual(chapterCount(slug));
    }
  });

  test("nobody writes about a chapter they haven't reached, and only members write", () => {
    for (const c of CIRCLES) {
      const members = new Set([c.owner, ...c.members]);
      for (const t of c.threads) {
        expect(t.chapter).toBeLessThanOrEqual(chapterCount(c.book));
        expect(members.has(t.author)).toBe(true);
        expect(progressOf(t.author, c.book)).toBeGreaterThanOrEqual(t.chapter);
        for (const cm of t.comments) {
          expect(members.has(cm.author)).toBe(true);
          expect(progressOf(cm.author, c.book)).toBeGreaterThanOrEqual(t.chapter);
        }
      }
    }
  });

  test("a real member sees both unlocked and locked discussions", () => {
    for (const c of CIRCLES.filter((x) => x.includeRealMembers)) {
      const p = progressOf("me", c.book, ["me"]);
      expect(c.threads.some((t) => t.chapter <= p)).toBe(true);
      expect(c.threads.some((t) => t.chapter > p)).toBe(true);
    }
  });
});

describe("seedDemo / removeDemo", () => {
  test("creates everything, and running it twice changes nothing", async () => {
    const first = await seedDemo(getDb(), { password: "sample-pass-1" });
    const count = async () => ({
      users: (await getDb().select().from(users)).length,
      circles: (await getDb().select().from(circles)).length,
      threads: (await getDb().select().from(threads)).length,
      comments: (await getDb().select().from(comments)).length,
    });
    const after1 = await count();
    await seedDemo(getDb(), { password: "sample-pass-1" });
    expect(await count()).toEqual(after1);
    expect(after1.users).toBe(SAMPLE_USERS.length);
    expect(after1.circles).toBe(CIRCLES.length);
    expect(first.threads).toBe(after1.threads);
  });

  test("sample accounts are labelled, use the reserved domain and can sign in", async () => {
    await seedDemo(getDb(), { password: "sample-pass-1" });
    const [u] = await getDb().select().from(users).where(eq(users.username, "elinor_reads"));
    expect(u.email).toBe(`elinor_reads@${SAMPLE_EMAIL_DOMAIN}`);
    expect(u.bio).toMatch(/Sample reader/);
    const c = await newClient();
    expect((await c.post("/api/auth/login", { email: sampleEmail("elinor_reads"), password: "sample-pass-1" })).status).toBe(200);
  });

  test("adds a real account to the circles with mixed progress, plus follows", async () => {
    const me = await signUp({ username: "realreader" });
    await seedDemo(getDb(), { password: "x-pass-123", members: ["realreader"] });
    const mine = (await me.client.get("/api/circles")).body.mine;
    expect(mine.map((c: { name: string }) => c.name).sort()).toEqual(["Pemberley Book Club", "The Netherfield Circle", "Yellow Brick Readers"]);
    const netherfield = mine.find((c: { name: string }) => c.name === "The Netherfield Circle");
    expect(netherfield.openThreads).toBeGreaterThan(0);
    expect(netherfield.lockedThreads).toBeGreaterThan(0);
    const followRows = await getDb().select().from(follows).where(eq(follows.followerId, me.user._id));
    expect(followRows).toHaveLength(3);
  });

  test("refuses to take over a real account with a sample username", async () => {
    await signUp({ username: "elinor_reads", email: "real@example.com" });
    await expect(seedDemo(getDb(), { password: "x-pass-123" })).rejects.toThrow(/refusing to overwrite/);
    // Nothing was half-written.
    expect(await getDb().select().from(circles)).toEqual([]);
  });

  test("fails clearly for an unknown --member", async () => {
    await expect(seedDemo(getDb(), { password: "x-pass-123", members: ["nobody"] })).rejects.toThrow(/No account called/);
  });

  test("removeDemo deletes demo data but keeps real accounts and their own content", async () => {
    const me = await signUp({ username: "realreader" });
    await me.client.post("/api/posts", { desc: "My own post" });
    await seedDemo(getDb(), { password: "x-pass-123", members: ["realreader"] });
    const { sampleUsers } = await removeDemo(getDb());
    expect(sampleUsers).toBe(SAMPLE_USERS.length);
    expect((await getDb().select().from(users)).map((u) => u.username)).toEqual(["realreader"]);
    expect(await getDb().select().from(circles)).toEqual([]);
    expect(await getDb().select().from(circleMembers)).toEqual([]);
    expect(await getDb().select().from(books)).toEqual([]);
    expect((await me.client.get("/api/posts/timeline")).body.map((p: { desc: string }) => p.desc)).toEqual(["My own post"]);
  });
});
