import { Router } from "express";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { follows, postLikes, posts, users } from "../db/schema";
import { handle, HttpError, isId } from "../http";
import { postDtos } from "../serializers";

const router = Router();

export const MAX_DESC = 500;
// Image keys come from /api/upload ("uploads/<name>") or legacy flat names.
export const IMAGE_KEY = /^(?:uploads\/)?[\w-]+(?:\.[\w]+)?$/;

const notFound = () => new HttpError(404, "Post not found.");

async function findPost(id: unknown) {
  if (!isId(id)) return undefined;
  const [post] = await getDb().select().from(posts).where(eq(posts.id, id));
  return post;
}

function validDesc(raw: unknown, hasImage: boolean): string {
  const text = String(raw ?? "").trim();
  if (!text && !hasImage) throw new HttpError(400, "Write something or add a photo.");
  if (text.length > MAX_DESC) throw new HttpError(400, `Posts can be at most ${MAX_DESC} characters.`);
  return text;
}

router.post(
  "/",
  handle(async (req, res) => {
    const { userId } = req.body;
    const img = req.body.img ? String(req.body.img) : undefined;
    if (!isId(userId)) throw new HttpError(400, "userId is required.");
    const description = validDesc(req.body.desc, Boolean(img));
    if (img && !IMAGE_KEY.test(img)) throw new HttpError(400, "Invalid image.");

    const db = getDb();
    const [author] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
    if (!author) throw new HttpError(404, "User not found.");

    const [post] = await db.insert(posts).values({ userId, description, imageKey: img ?? null }).returning();
    res.status(201).json((await postDtos(db, [post]))[0]);
  })
);

router.put(
  "/:id",
  handle(async (req, res) => {
    const post = await findPost(req.params.id);
    if (!post) throw notFound();
    if (post.userId !== req.body.userId) throw new HttpError(403, "You can only edit your own posts.");
    const description = validDesc(req.body.desc, Boolean(post.imageKey));
    const db = getDb();
    const [updated] = await db
      .update(posts)
      .set({ description, updatedAt: new Date() })
      .where(eq(posts.id, post.id))
      .returning();
    res.json((await postDtos(db, [updated]))[0]);
  })
);

router.delete(
  "/:id",
  handle(async (req, res) => {
    const post = await findPost(req.params.id);
    if (!post) throw notFound();
    if (post.userId !== req.body.userId) throw new HttpError(403, "You can only delete your own posts.");
    await getDb().delete(posts).where(eq(posts.id, post.id));
    res.json({ message: "Post deleted." });
  })
);

// Toggle like. Responds with the new state and count.
router.put(
  "/:id/like",
  handle(async (req, res) => {
    const { userId } = req.body;
    if (!isId(userId)) throw new HttpError(400, "userId is required.");
    const post = await findPost(req.params.id);
    if (!post) throw notFound();

    const db = getDb();
    const removed = await db
      .delete(postLikes)
      .where(and(eq(postLikes.postId, post.id), eq(postLikes.userId, userId)))
      .returning({ id: postLikes.userId });
    const liked = removed.length === 0;
    if (liked) await db.insert(postLikes).values({ postId: post.id, userId }).onConflictDoNothing();

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(postLikes)
      .where(eq(postLikes.postId, post.id));
    res.json({ liked, likes: count });
  })
);

router.get(
  "/:id",
  handle(async (req, res) => {
    const post = await findPost(req.params.id);
    if (!post) throw notFound();
    res.json((await postDtos(getDb(), [post]))[0]);
  })
);

// Your posts plus posts from people you follow, newest first.
router.get(
  "/timeline/:userId",
  handle(async (req, res) => {
    const { userId } = req.params;
    if (!isId(userId)) throw new HttpError(404, "User not found.");
    const db = getDb();
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
    if (!user) throw new HttpError(404, "User not found.");

    const followed = db
      .select({ id: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, userId));
    const rows = await db
      .select()
      .from(posts)
      .where(or(eq(posts.userId, userId), inArray(posts.userId, followed)))
      .orderBy(desc(posts.createdAt))
      .limit(200);
    res.json(await postDtos(db, rows));
  })
);

router.get(
  "/profile/:username",
  handle(async (req, res) => {
    const db = getDb();
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.username, req.params.username));
    if (!user) throw new HttpError(404, "User not found.");
    const rows = await db
      .select()
      .from(posts)
      .where(eq(posts.userId, user.id))
      .orderBy(desc(posts.createdAt))
      .limit(200);
    res.json(await postDtos(db, rows));
  })
);

export default router;
