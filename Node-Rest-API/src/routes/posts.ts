import { RequestHandler, Router } from "express";
import { and, asc, desc, eq, inArray, isNotNull, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { follows, notifications, postComments, postLikes, posts, users } from "../db/schema";
import { handle, HttpError, isId } from "../http";
import { postDtos } from "../serializers";
import { blockedIds } from "../policy";
import { requireAuth } from "../auth";

export const MAX_DESC = 500;
export const MAX_COMMENT = 1000;
export const MAX_SPOILER_FOR = 80;
// Image keys come from /api/upload ("uploads/<name>") or legacy flat names.
export const IMAGE_KEY = /^(?:uploads\/)?[\w-]+(?:\.[\w]+)?$/;

type Viewer = NonNullable<Express.Request["user"]>;
const pass: RequestHandler = (req, res, next) => next();
const notFound = () => new HttpError(404, "Post not found.");

async function findPost(id: unknown) {
  if (!isId(id)) return undefined;
  const [post] = await getDb().select().from(posts).where(eq(posts.id, id));
  return post;
}

// A post the reader may see: not by someone blocked either way, and not by a
// suspended reader (unless the viewer is an admin).
async function visiblePost(id: unknown, viewer: Viewer) {
  const post = await findPost(id);
  if (!post) throw notFound();
  if (post.userId !== viewer.id) {
    if ((await blockedIds(viewer.id)).has(post.userId)) throw notFound();
    const [author] = await getDb().select({ suspendedAt: users.suspendedAt }).from(users).where(eq(users.id, post.userId));
    if (!author || (author.suspendedAt && !viewer.isAdmin)) throw notFound();
  }
  return post;
}

function validDesc(raw: unknown, hasImage: boolean): string {
  const text = String(raw ?? "").trim();
  if (!text && !hasImage) throw new HttpError(400, "Write something or add a photo.");
  if (text.length > MAX_DESC) throw new HttpError(400, `Posts can be at most ${MAX_DESC} characters.`);
  return text;
}

// { spoiler, spoilerFor } from a request; fields left out stay as they are.
export function spoilerFields(body: Record<string, unknown>, current: { spoiler: boolean; spoilerFor: string | null } = { spoiler: false, spoilerFor: null }) {
  let { spoiler, spoilerFor } = current;
  if (body.spoiler !== undefined) {
    if (typeof body.spoiler !== "boolean") throw new HttpError(400, "Spoiler must be true or false.");
    spoiler = body.spoiler;
  }
  if (body.spoilerFor !== undefined) {
    const v = body.spoilerFor === null ? "" : String(body.spoilerFor).trim().replace(/\s+/g, " ");
    if (v.length > MAX_SPOILER_FOR) throw new HttpError(400, `The book name can be at most ${MAX_SPOILER_FOR} characters.`);
    spoilerFor = v || null;
  }
  // A label only makes sense on a spoiler post.
  if (!spoiler) spoilerFor = null;
  return { spoiler, spoilerFor };
}

function validComment(raw: unknown): string {
  const body = String(raw ?? "").trim();
  if (!body) throw new HttpError(400, "Write something first.");
  if (body.length > MAX_COMMENT) throw new HttpError(400, `Comments can be at most ${MAX_COMMENT} characters.`);
  return body;
}

const authorFields = { _id: users.id, username: users.username, profilePicture: users.profilePicture };

export function postRouter(limitPosting: RequestHandler = pass) {
  const router = Router();
  router.use(requireAuth);

  // ---------- Reading ----------

  // The signed-in user's timeline: their posts plus posts from people they follow.
  router.get(
    "/timeline",
    handle(async (req, res) => {
      const db = getDb();
      const me = req.user!.id;
      const followed = db.select({ id: follows.followingId }).from(follows).where(eq(follows.followerId, me));
      const rows = await db
        .select()
        .from(posts)
        .where(
          and(
            or(eq(posts.userId, me), inArray(posts.userId, followed)),
            // Suspended readers' posts drop out of everyone's feed.
            notInArray(posts.userId, db.select({ id: users.id }).from(users).where(isNotNull(users.suspendedAt)))
          )
        )
        .orderBy(desc(posts.createdAt))
        .limit(200);
      res.json(await postDtos(db, rows));
    })
  );

  router.get(
    "/profile/:username",
    handle(async (req, res) => {
      const db = getDb();
      const [user] = await db.select({ id: users.id, suspendedAt: users.suspendedAt }).from(users).where(eq(users.username, req.params.username));
      if (!user || (user.suspendedAt && !req.user!.isAdmin)) throw new HttpError(404, "User not found.");
      // Blocked either way: no posts.
      if ((await blockedIds(req.user!.id)).has(user.id)) {
        res.json([]);
        return;
      }
      const rows = await db.select().from(posts).where(eq(posts.userId, user.id)).orderBy(desc(posts.createdAt)).limit(200);
      res.json(await postDtos(db, rows));
    })
  );

  router.get(
    "/:id",
    handle(async (req, res) => {
      const post = await visiblePost(req.params.id, req.user!);
      res.json((await postDtos(getDb(), [post]))[0]);
    })
  );

  // ---------- Writing ----------

  // The author is always the signed-in user.
  router.post(
    "/",
    limitPosting,
    handle(async (req, res) => {
      const img = req.body.img ? String(req.body.img) : undefined;
      const description = validDesc(req.body.desc, Boolean(img));
      if (img && !IMAGE_KEY.test(img)) throw new HttpError(400, "Invalid image.");
      const { spoiler, spoilerFor } = spoilerFields(req.body);
      const db = getDb();
      const [post] = await db
        .insert(posts)
        .values({ userId: req.user!.id, description, imageKey: img ?? null, spoiler, spoilerFor })
        .returning();
      res.status(201).json((await postDtos(db, [post]))[0]);
    })
  );

  // Edit your own post: its text and spoiler cover (the photo stays).
  router.put(
    "/:id",
    limitPosting,
    handle(async (req, res) => {
      const post = await findPost(req.params.id);
      if (!post) throw notFound();
      if (post.userId !== req.user!.id) throw new HttpError(403, "You can only edit your own posts.");
      const description = req.body.desc === undefined ? post.description : validDesc(req.body.desc, Boolean(post.imageKey));
      const { spoiler, spoilerFor } = spoilerFields(req.body, { spoiler: post.spoiler, spoilerFor: post.spoilerFor });
      const db = getDb();
      const [updated] = await db
        .update(posts)
        .set({ description, spoiler, spoilerFor, editedAt: new Date(), updatedAt: new Date() })
        .where(eq(posts.id, post.id))
        .returning();
      res.json((await postDtos(db, [updated]))[0]);
    })
  );

  // Delete your own post (its likes, comments and notifications go with it).
  router.delete(
    "/:id",
    handle(async (req, res) => {
      const post = await findPost(req.params.id);
      if (!post) throw notFound();
      if (post.userId !== req.user!.id) throw new HttpError(403, "You can only delete your own posts.");
      await getDb().delete(posts).where(eq(posts.id, post.id));
      res.json({ message: "Post deleted." });
    })
  );

  // Toggle the signed-in user's like. Responds with the new state and count.
  router.put(
    "/:id/like",
    handle(async (req, res) => {
      const post = await visiblePost(req.params.id, req.user!);
      const userId = req.user!.id;
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

  // ---------- Comments ----------

  // Oldest first. Blocked readers' and suspended readers' comments are left out.
  router.get(
    "/:id/comments",
    handle(async (req, res) => {
      const me = req.user!;
      const post = await visiblePost(req.params.id, me);
      const blocked = await blockedIds(me.id);
      const rows = await getDb()
        .select({
          _id: postComments.id,
          body: postComments.body,
          createdAt: postComments.createdAt,
          editedAt: postComments.editedAt,
          author: authorFields,
          suspendedAt: users.suspendedAt,
        })
        .from(postComments)
        .innerJoin(users, eq(users.id, postComments.authorId))
        .where(eq(postComments.postId, post.id))
        .orderBy(asc(postComments.createdAt));
      res.json(
        rows
          .filter((c) => !blocked.has(c.author._id) && (!c.suspendedAt || me.isAdmin))
          .map(({ suspendedAt: _s, ...c }) => ({ ...c, canDelete: c.author._id === me.id || post.userId === me.id }))
      );
    })
  );

  router.post(
    "/:id/comments",
    limitPosting,
    handle(async (req, res) => {
      const me = req.user!;
      const post = await visiblePost(req.params.id, me);
      const body = validComment(req.body.body);
      const comment = await getDb().transaction(async (tx) => {
        const [c] = await tx.insert(postComments).values({ postId: post.id, authorId: me.id, body }).returning();
        // Tell the post's owner (never yourself).
        if (post.userId !== me.id) {
          await tx.insert(notifications).values({ userId: post.userId, type: "post_comment", actorId: me.id, postId: post.id, postCommentId: c.id });
        }
        return c;
      });
      res.status(201).json({
        _id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt,
        editedAt: null,
        author: { _id: me.id, username: me.username, profilePicture: me.profilePicture },
        canDelete: true,
      });
    })
  );

  return router;
}

// One comment: /api/post-comments/:id
export function postCommentRouter(limitPosting: RequestHandler = pass) {
  const router = Router();
  router.use("/post-comments", requireAuth);

  async function findComment(id: unknown, viewer: Viewer) {
    if (!isId(id)) throw new HttpError(404, "Comment not found.");
    const [c] = await getDb().select().from(postComments).where(eq(postComments.id, id));
    if (!c) throw new HttpError(404, "Comment not found.");
    // Only comments on posts you can see, by readers you haven't blocked.
    let post;
    try {
      post = await visiblePost(c.postId, viewer);
    } catch {
      throw new HttpError(404, "Comment not found.");
    }
    if (c.authorId !== viewer.id && (await blockedIds(viewer.id)).has(c.authorId)) throw new HttpError(404, "Comment not found.");
    return { comment: c, post };
  }

  router.patch(
    "/post-comments/:id",
    limitPosting,
    handle(async (req, res) => {
      const { comment } = await findComment(req.params.id, req.user!);
      if (comment.authorId !== req.user!.id) throw new HttpError(403, "You can only edit your own comments.");
      const body = validComment(req.body.body);
      const [c] = await getDb().update(postComments).set({ body, editedAt: new Date() }).where(eq(postComments.id, comment.id)).returning();
      res.json({ _id: c.id, body: c.body, editedAt: c.editedAt });
    })
  );

  // Your own comment, or any comment on your own post.
  router.delete(
    "/post-comments/:id",
    handle(async (req, res) => {
      const { comment, post } = await findComment(req.params.id, req.user!);
      if (comment.authorId !== req.user!.id && post.userId !== req.user!.id) {
        throw new HttpError(403, "You can only delete your own comments, or comments on your posts.");
      }
      await getDb().delete(postComments).where(eq(postComments.id, comment.id));
      res.json({ deleted: true });
    })
  );

  return router;
}

export default postRouter;
