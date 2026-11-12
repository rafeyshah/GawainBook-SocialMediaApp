// Blocking readers and in-app notifications.
import { Router } from "express";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "../db/client";
import { blocks, circles, comments, follows, notifications, postComments, posts, threads, users } from "../db/schema";
import { handle, HttpError, isId } from "../http";
import { requireAuth } from "../auth";
import { blockedIds, threadAccess, viewerOf } from "../policy";

export const NOTIFICATION_LIMIT = 50;
export const PREVIEW_LENGTH = 140;

export function safetyRouter() {
  const router = Router();
  router.use(["/blocks", "/notifications"], requireAuth);

  router.get(
    "/blocks",
    handle(async (req, res) => {
      const rows = await getDb()
        .select({ _id: users.id, username: users.username, profilePicture: users.profilePicture, blockedAt: blocks.createdAt })
        .from(blocks)
        .innerJoin(users, eq(users.id, blocks.blockedId))
        .where(eq(blocks.blockerId, req.user!.id))
        .orderBy(desc(blocks.createdAt));
      res.json(rows);
    })
  );

  // Block a reader: hides each other's writing everywhere and ends any
  // follows between you.
  router.put(
    "/blocks/:userId",
    handle(async (req, res) => {
      const me = req.user!.id;
      const them = req.params.userId;
      if (!isId(them)) throw new HttpError(404, "User not found.");
      if (them === me) throw new HttpError(400, "You can't block yourself.");
      const db = getDb();
      const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, them));
      if (!target) throw new HttpError(404, "User not found.");
      await db.transaction(async (tx) => {
        await tx.insert(blocks).values({ blockerId: me, blockedId: them }).onConflictDoNothing();
        await tx
          .delete(follows)
          .where(or(and(eq(follows.followerId, me), eq(follows.followingId, them)), and(eq(follows.followerId, them), eq(follows.followingId, me))));
      });
      res.json({ blocked: true });
    })
  );

  router.delete(
    "/blocks/:userId",
    handle(async (req, res) => {
      if (!isId(req.params.userId)) throw new HttpError(404, "User not found.");
      const done = await getDb()
        .delete(blocks)
        .where(and(eq(blocks.blockerId, req.user!.id), eq(blocks.blockedId, req.params.userId)))
        .returning({ id: blocks.blockedId });
      if (done.length === 0) throw new HttpError(404, "You haven't blocked this reader.");
      res.json({ blocked: false });
    })
  );

  // Notifications store no text. Each one is checked against the access
  // rule now, for the reader as they are now: a reply in a chapter they
  // haven't reached, a circle they've left, a hidden reply or a blocked
  // reader is simply not delivered.
  async function deliverable(me: string) {
    const db = getDb();
    const rows = await db
      .select({
        _id: notifications.id,
        type: notifications.type,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
        actor: { _id: users.id, username: users.username, profilePicture: users.profilePicture, suspendedAt: users.suspendedAt },
        thread: threads,
        comment: { body: comments.body, hiddenAt: comments.hiddenAt },
        post: { id: posts.id, description: posts.description, spoiler: posts.spoiler },
        postComment: { body: postComments.body },
      })
      .from(notifications)
      .innerJoin(users, eq(users.id, notifications.actorId))
      .leftJoin(threads, eq(threads.id, notifications.threadId))
      .leftJoin(comments, eq(comments.id, notifications.commentId))
      .leftJoin(posts, eq(posts.id, notifications.postId))
      .leftJoin(postComments, eq(postComments.id, notifications.postCommentId))
      .where(eq(notifications.userId, me))
      .orderBy(desc(notifications.createdAt))
      .limit(NOTIFICATION_LIMIT);
    const circleIds = [...new Set(rows.flatMap((r) => (r.thread ? [r.thread.circleId] : [])))];
    const circleRows = circleIds.length ? await db.select().from(circles).where(inArray(circles.id, circleIds)) : [];
    const viewers = new Map(await Promise.all(circleRows.map(async (c) => [c.id, { circle: c, viewer: await viewerOf(c, me) }] as const)));
    const blocked = await blockedIds(me);

    const out = [];
    for (const r of rows) {
      if (blocked.has(r.actor._id) || r.actor.suspendedAt) continue;
      const actor = { _id: r.actor._id, username: r.actor.username, profilePicture: r.actor.profilePicture };
      const base = { _id: r._id, type: r.type, read: r.readAt !== null, createdAt: r.createdAt, actor };

      if (r.type === "post_comment") {
        // The comment (or the post) may have been deleted since.
        if (!r.post?.id || !r.postComment?.body) continue;
        out.push({
          ...base,
          post: { _id: r.post.id, preview: r.post.spoiler ? "" : preview(r.post.description) },
          // On a spoiler post even a comment can give it away: no preview.
          preview: r.post.spoiler ? "" : preview(r.postComment.body),
        });
        continue;
      }

      if (!r.thread) continue;
      const v = viewers.get(r.thread.circleId);
      if (!v) continue;
      const { circle, viewer } = v;
      if (!r.comment || r.comment.hiddenAt || r.thread.hiddenAt) continue;
      if (threadAccess(circle, viewer.role, viewer.progress, r.thread.chapterSeq, viewer.blocked.has(r.thread.authorId)) !== "open") continue;
      out.push({
        ...base,
        thread: { _id: r.thread.id, title: r.thread.title, chapterSeq: r.thread.chapterSeq },
        circle: { _id: circle.id, name: circle.name },
        preview: preview(r.comment.body),
      });
    }
    return out;
  }

  router.get(
    "/notifications",
    handle(async (req, res) => {
      const items = await deliverable(req.user!.id);
      res.json({ unread: items.filter((n) => !n.read).length, items });
    })
  );

  router.post(
    "/notifications/read",
    handle(async (req, res) => {
      const ids: unknown = req.body.ids;
      const db = getDb();
      const mine = and(eq(notifications.userId, req.user!.id), isNull(notifications.readAt));
      if (ids === undefined) {
        await db.update(notifications).set({ readAt: new Date() }).where(mine);
      } else {
        if (!Array.isArray(ids) || ids.length > 100 || !ids.every(isId)) throw new HttpError(400, "ids must be a list of notification ids.");
        if (ids.length) await db.update(notifications).set({ readAt: new Date() }).where(and(mine, inArray(notifications.id, ids as string[])));
      }
      res.json({ ok: true });
    })
  );

  return router;
}

export function preview(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_LENGTH ? flat.slice(0, PREVIEW_LENGTH - 1).trimEnd() + "…" : flat;
}
