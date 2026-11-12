import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { follows, postComments, postLikes, posts, users } from "../src/db/schema";
import { CIRCLES, POSTS, SAMPLE_FOLLOWS, SAMPLE_USERS } from "../src/seed/data";
import { seedDemo, removeDemo } from "../src/seed/seed";
import { LANGUAGES, cleanGenres } from "../src/routes/users";

const names = new Set(SAMPLE_USERS.map((u) => u.username));

describe("demo data is consistent", () => {
  test("every reader named in posts, likes, comments, follows and circles exists", () => {
    for (const p of POSTS) {
      expect(names.has(p.author)).toBe(true);
      for (const l of p.likes ?? []) expect(names.has(l)).toBe(true);
      for (const c of p.comments ?? []) expect(names.has(c.author)).toBe(true);
    }
    for (const [a, b] of SAMPLE_FOLLOWS) {
      expect(names.has(a) && names.has(b)).toBe(true);
      expect(a).not.toBe(b);
    }
    for (const c of CIRCLES) for (const m of [c.owner, ...c.members]) expect(names.has(m)).toBe(true);
  });

  test("no duplicate follows; nobody likes their own post", () => {
    const keys = SAMPLE_FOLLOWS.map(([a, b]) => `${a}>${b}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of POSTS) expect(p.likes ?? []).not.toContain(p.author);
  });

  test("posts and comments fit the app's limits; profiles are valid", () => {
    for (const p of POSTS) {
      expect(p.desc.length).toBeLessThanOrEqual(500);
      expect((p.spoilerFor ?? "").length).toBeLessThanOrEqual(80);
      for (const c of p.comments ?? []) expect(c.body.length).toBeLessThanOrEqual(1000);
    }
    for (const u of SAMPLE_USERS) {
      expect(u.profile).toBeDefined();
      expect(cleanGenres(u.profile!.genres)).toEqual(u.profile!.genres);
      expect(LANGUAGES).toContain(u.profile!.language);
      expect(u.profile!.pace).toBeGreaterThanOrEqual(1);
      expect(u.profile!.pace).toBeLessThanOrEqual(100);
    }
  });

  test("there's at least one spoiler post, with a book name", () => {
    expect(POSTS.some((p) => p.spoiler && p.spoilerFor)).toBe(true);
  });
});

describe("seeding the feed", () => {
  const counts = async () => ({
    posts: (await getDb().select().from(posts)).length,
    likes: (await getDb().select().from(postLikes)).length,
    comments: (await getDb().select().from(postComments)).length,
    follows: (await getDb().select().from(follows)).length,
  });

  test("writes posts, likes, comments and follows, and re-running doesn't duplicate", async () => {
    const first = await seedDemo(getDb(), { password: "sample-pass-1" });
    expect(first.posts).toBe(POSTS.length);
    const expected = {
      posts: POSTS.length,
      likes: POSTS.reduce((n, p) => n + (p.likes?.length ?? 0), 0),
      comments: POSTS.reduce((n, p) => n + (p.comments?.length ?? 0), 0),
      follows: SAMPLE_FOLLOWS.length,
    };
    expect(await counts()).toEqual(expected);
    await seedDemo(getDb(), { password: "sample-pass-1" });
    expect(await counts()).toEqual(expected);
  });

  test("the spoiler post keeps its cover; comments come after their post", async () => {
    await seedDemo(getDb(), { password: "sample-pass-1" });
    const spoilerSeed = POSTS.find((p) => p.spoiler)!;
    const [row] = await getDb().select().from(posts).where(eq(posts.description, spoilerSeed.desc));
    expect(row).toMatchObject({ spoiler: true, spoilerFor: spoilerSeed.spoilerFor });
    for (const c of await getDb().select().from(postComments)) {
      const [p] = await getDb().select().from(posts).where(eq(posts.id, c.postId));
      expect(c.createdAt.getTime()).toBeGreaterThan(p.createdAt.getTime());
    }
  });

  test("reading profiles are saved", async () => {
    await seedDemo(getDb(), { password: "sample-pass-1" });
    const [emma] = await getDb().select().from(users).where(eq(users.username, "emma_woodhouse"));
    expect(emma).toMatchObject({ readingLanguage: "de", pace: 6 });
    expect(emma.favoriteGenres).toContain("Romance");
  });

  test("removeDemo clears the feed too", async () => {
    await seedDemo(getDb(), { password: "sample-pass-1" });
    await removeDemo(getDb());
    expect(await counts()).toEqual({ posts: 0, likes: 0, comments: 0, follows: 0 });
  });
});
