// The database enforces the rules itself, so a bug in a route can't store
// bad data. These tests bypass the API and write to Postgres directly.
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { follows, postLikes, posts, users } from "../src/db/schema";

const db = () => getDb();
const newUser = async (n: string, extra: Partial<typeof users.$inferInsert> = {}) =>
  (await db().insert(users).values({ username: n, email: `${n}@example.com`, passwordHash: "h", ...extra }).returning())[0];

const pgCode = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    // drizzle wraps driver errors; the Postgres code is on the cause.
    const err = e as { code?: string; cause?: { code?: string } };
    return err.code || err.cause?.code;
  }
};

describe("users table", () => {
  test("generates UUID ids and timestamps", async () => {
    const u = await newUser("jane");
    expect(u.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(u.createdAt).toBeInstanceOf(Date);
  });

  test("keeps migrated ObjectId-style ids", async () => {
    const u = await newUser("legacy", { id: "64b000000000000000000001" });
    expect(u.id).toBe("64b000000000000000000001");
  });

  test.each([
    ["duplicate username", async () => { await newUser("jane"); return newUser("jane", { email: "other@example.com" }); }, "23505"],
    ["duplicate email", async () => { await newUser("jane"); return newUser("bob", { email: "jane@example.com" }); }, "23505"],
    ["uppercase email", () => newUser("mixed", { email: "Mixed@Example.com" }), "23514"],
    ["username too short", () => newUser("ab"), "23514"],
    ["relationship out of range", () => newUser("rel", { relationship: 4 }), "23514"],
  ])("rejects %s", async (_name, run, code) => {
    expect(await pgCode(run())).toBe(code);
  });
});

describe("follows table", () => {
  test("rejects self-follows and duplicates", async () => {
    const a = await newUser("alice");
    const b = await newUser("bobby");
    expect(await pgCode(db().insert(follows).values({ followerId: a.id, followingId: a.id }))).toBe("23514");
    await db().insert(follows).values({ followerId: a.id, followingId: b.id });
    expect(await pgCode(db().insert(follows).values({ followerId: a.id, followingId: b.id }))).toBe("23505");
  });

  test("rejects follows that point at missing users", async () => {
    const a = await newUser("alice");
    expect(await pgCode(db().insert(follows).values({ followerId: a.id, followingId: "64b000000000000000000000" }))).toBe("23503");
  });
});

describe("posts and likes tables", () => {
  test("rejects empty posts and text over 500 characters", async () => {
    const a = await newUser("alice");
    expect(await pgCode(db().insert(posts).values({ userId: a.id, description: "" }))).toBe("23514");
    expect(await pgCode(db().insert(posts).values({ userId: a.id, description: "x".repeat(501) }))).toBe("23514");
    expect(await pgCode(db().insert(posts).values({ userId: a.id, description: "", imageKey: "uploads/a.png" }))).toBe("ok");
  });

  test("one like per reader per post", async () => {
    const a = await newUser("alice");
    const [p] = await db().insert(posts).values({ userId: a.id, description: "hi" }).returning();
    await db().insert(postLikes).values({ postId: p.id, userId: a.id });
    expect(await pgCode(db().insert(postLikes).values({ postId: p.id, userId: a.id }))).toBe("23505");
  });

  test("deleting a user cascades to their posts, likes and follows", async () => {
    const a = await newUser("alice");
    const b = await newUser("bobby");
    const [p] = await db().insert(posts).values({ userId: a.id, description: "hi" }).returning();
    await db().insert(postLikes).values({ postId: p.id, userId: b.id });
    await db().insert(follows).values({ followerId: b.id, followingId: a.id });

    await db().delete(users).where(eq(users.id, a.id));
    expect(await db().select().from(posts)).toEqual([]);
    expect(await db().select().from(postLikes)).toEqual([]);
    expect(await db().select().from(follows)).toEqual([]);
    expect(await db().select().from(users)).toHaveLength(1);
  });
});
