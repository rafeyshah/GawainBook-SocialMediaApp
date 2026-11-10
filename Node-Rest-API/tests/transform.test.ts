import { imageKeyFor, MongoPost, MongoUser, planMigration } from "../src/migration/transform";

const oid = (n: number) => ({ toString: () => n.toString(16).padStart(24, "0") });
const id = (n: number) => oid(n).toString();
const user = (n: number, extra: Partial<MongoUser> = {}): MongoUser => ({
  _id: oid(n),
  username: `reader${n}`,
  email: `reader${n}@example.com`,
  password: "$2b$10$hash",
  ...extra,
});
const NOW = new Date("2026-11-10T00:00:00Z");
const plan = (users: MongoUser[], posts: MongoPost[] = [], exists = () => true) => planMigration(users, posts, exists, NOW);

describe("imageKeyFor", () => {
  test.each([
    ["1648451349883wallhaven-vg8exm.png", "uploads/1648451349883wallhaven-vg8exm.png"],
    ["cover photo.jpeg", "uploads/cover-photo.jpeg"],
    ["a.b.c.png", "uploads/a-b-c.png"],
  ])("%p → %p", (input, expected) => expect(imageKeyFor(input)).toBe(expected));
});

describe("users", () => {
  test("keeps ids and password hashes, maps field names and lowercases email", () => {
    const p = plan([user(1, { email: " Reader1@Example.COM ", desc: "Hi", from: "Karachi", city: "Lahore", relationship: 2 })]);
    expect(p.users[0]).toMatchObject({
      id: id(1),
      email: "reader1@example.com",
      passwordHash: "$2b$10$hash",
      bio: "Hi",
      hometown: "Karachi",
      city: "Lahore",
      relationship: 2,
      createdAt: NOW,
    });
  });

  test.each([
    ["short username", { username: "ab" }, /3–20/],
    ["invalid email", { email: "nope" }, /invalid email/],
    ["missing password", { password: "" }, /no password/],
  ])("skips a user with %s", (_n, extra, reason) => {
    const p = plan([user(1, extra)]);
    expect(p.users).toEqual([]);
    expect(p.skipped[0]).toMatch(reason);
  });

  test("keeps the first of duplicate emails or usernames", () => {
    const p = plan([user(1), user(2, { email: "READER1@example.com" }), user(3, { username: "reader1", email: "x@example.com" })]);
    expect(p.users.map((u) => u.id)).toEqual([id(1)]);
    expect(p.skipped).toHaveLength(2);
  });

  test("invalid relationship values become null and long text is capped", () => {
    const p = plan([user(1, { relationship: 7, desc: "x".repeat(300) })]);
    expect(p.users[0].relationship).toBeNull();
    expect(p.users[0].bio).toHaveLength(200);
  });
});

describe("follows", () => {
  test("keeps valid follows, dropping self-follows, duplicates and unknown users", () => {
    const p = plan([user(1, { followings: [oid(2), oid(2), oid(1), oid(99)] }), user(2)]);
    expect(p.follows).toEqual([{ followerId: id(1), followingId: id(2) }]);
  });

  test("drops follows involving skipped users", () => {
    const p = plan([user(1, { followings: [oid(2)] }), user(2, { username: "x" })]);
    expect(p.follows).toEqual([]);
  });
});

describe("posts and likes", () => {
  test("migrates text posts with deduplicated likes from known users", () => {
    const p = plan([user(1), user(2)], [{ _id: oid(10), userId: oid(1), desc: " Hello ", likes: [oid(2), oid(2), oid(99)] }]);
    expect(p.posts[0]).toMatchObject({ id: id(10), userId: id(1), description: "Hello", imageKey: null });
    expect(p.likes).toEqual([{ postId: id(10), userId: id(2) }]);
  });

  test("copies images that still exist", () => {
    const p = plan([user(1)], [{ _id: oid(10), userId: oid(1), img: "a b.jpeg" }]);
    expect(p.posts[0].imageKey).toBe("uploads/a-b.jpeg");
    expect(p.images).toEqual([{ source: "a b.jpeg", key: "uploads/a-b.jpeg" }]);
  });

  test("drops missing images but keeps the text", () => {
    const p = plan([user(1)], [{ _id: oid(10), userId: oid(1), desc: "caption", img: "gone.png" }], () => false);
    expect(p.posts[0].imageKey).toBeNull();
    expect(p.images).toEqual([]);
    expect(p.skipped[0]).toMatch(/no longer on disk/);
  });

  test.each([
    ["an orphaned post", { userId: oid(99), desc: "x" }, /not migrated/],
    ["a post over 500 characters", { userId: oid(1), desc: "x".repeat(501) }, /longer than 500/],
    ["a photo-only post whose photo is gone", { userId: oid(1), img: "gone.png" }, /empty after dropping/],
  ])("skips %s", (_n, extra, reason) => {
    const p = plan([user(1)], [{ _id: oid(10), ...extra }], () => false);
    expect(p.posts).toEqual([]);
    expect(p.skipped.join("\n")).toMatch(reason);
  });

  test("never copies an image path with directories", () => {
    const p = plan([user(1)], [{ _id: oid(10), userId: oid(1), desc: "x", img: "../../etc/passwd" }]);
    expect(p.images).toEqual([]);
    expect(p.posts[0].imageKey).toBeNull();
  });

  test("handles empty input", () => {
    expect(plan([], [])).toEqual({ users: [], follows: [], posts: [], likes: [], images: [], skipped: [] });
  });
});
