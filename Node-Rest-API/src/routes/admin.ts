// Site-wide moderation for GawainBook's admins: reports about posts and
// profiles (circle content is handled by each circle's moderators), removing
// posts and suspending accounts. Grant admin with `npm run admin -- --grant=<username>`.
import { NextFunction, Request, Response, Router } from "express";
import { and, asc, count, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import { circles, postComments, posts, reports, users } from "../db/schema";
import { handle, HttpError, isId } from "../http";
import { endAllSessions, requireAuth } from "../auth";

// Non-admins get a plain 404: the admin area doesn't advertise itself.
const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user?.isAdmin) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  next();
};

const userFields = { _id: users.id, username: users.username, profilePicture: users.profilePicture };

async function resolveReports(targetType: "post" | "post_comment" | "user", targetId: string, by: string) {
  await getDb()
    .update(reports)
    .set({ status: "hidden", resolvedBy: by, resolvedAt: new Date() })
    .where(and(eq(reports.targetType, targetType), eq(reports.targetId, targetId), eq(reports.status, "open")));
}

export function adminRouter() {
  const router = Router();
  router.use("/admin", requireAuth, requireAdmin);

  router.get(
    "/admin/stats",
    handle(async (req, res) => {
      const db = getDb();
      const [[u], [s], [c], [r]] = await Promise.all([
        db.select({ n: count() }).from(users),
        db.select({ n: count() }).from(users).where(isNotNull(users.suspendedAt)),
        db.select({ n: count() }).from(circles),
        db.select({ n: count() }).from(reports).where(and(eq(reports.status, "open"), isNull(reports.circleId))),
      ]);
      res.json({ users: Number(u.n), suspended: Number(s.n), circles: Number(c.n), openReports: Number(r.n) });
    })
  );

  // Open reports about posts and profiles, oldest first, with what was reported.
  router.get(
    "/admin/reports",
    handle(async (req, res) => {
      const db = getDb();
      const rows = await db
        .select({
          _id: reports.id,
          targetType: reports.targetType,
          targetId: reports.targetId,
          reason: reports.reason,
          details: reports.details,
          createdAt: reports.createdAt,
          reporter: userFields,
        })
        .from(reports)
        .innerJoin(users, eq(users.id, reports.reporterId))
        .where(and(eq(reports.status, "open"), isNull(reports.circleId)))
        .orderBy(asc(reports.createdAt));
      const postIds = rows.filter((r) => r.targetType === "post").map((r) => r.targetId);
      const userIds = rows.filter((r) => r.targetType === "user").map((r) => r.targetId);
      const commentIds = rows.filter((r) => r.targetType === "post_comment").map((r) => r.targetId);
      const commentRows = commentIds.length
        ? await db
            .select({ _id: postComments.id, text: postComments.body, postId: postComments.postId, createdAt: postComments.createdAt, author: userFields })
            .from(postComments)
            .innerJoin(users, eq(users.id, postComments.authorId))
            .where(inArray(postComments.id, commentIds))
        : [];
      const commentById = new Map(commentRows.map((c) => [c._id, c]));
      const postRows = postIds.length
        ? await db
            .select({ _id: posts.id, text: posts.description, image: posts.imageKey, createdAt: posts.createdAt, author: userFields })
            .from(posts)
            .innerJoin(users, eq(users.id, posts.userId))
            .where(inArray(posts.id, postIds))
        : [];
      const profileRows = userIds.length
        ? await db
            .select({ ...userFields, bio: users.bio, suspendedAt: users.suspendedAt, isAdmin: users.isAdmin })
            .from(users)
            .where(inArray(users.id, userIds))
        : [];
      const postById = new Map(postRows.map((p) => [p._id, p]));
      const userById = new Map(profileRows.map((u) => [u._id, u]));
      res.json(
        rows
          .map((r) => ({
            ...r,
            target: r.targetType === "post" ? postById.get(r.targetId) : r.targetType === "post_comment" ? commentById.get(r.targetId) : userById.get(r.targetId),
          }))
          // Content already removed: nothing left to review.
          .filter((r) => r.target)
      );
    })
  );

  router.post(
    "/admin/reports/:id/dismiss",
    handle(async (req, res) => {
      if (!isId(req.params.id)) throw new HttpError(404, "Report not found.");
      const done = await getDb()
        .update(reports)
        .set({ status: "dismissed", resolvedBy: req.user!.id, resolvedAt: new Date() })
        .where(and(eq(reports.id, req.params.id), eq(reports.status, "open"), isNull(reports.circleId)))
        .returning({ id: reports.id });
      if (done.length === 0) throw new HttpError(404, "Report not found or already handled.");
      res.json({ status: "dismissed" });
    })
  );

  router.delete(
    "/admin/posts/:id",
    handle(async (req, res) => {
      if (!isId(req.params.id)) throw new HttpError(404, "Post not found.");
      const done = await getDb().delete(posts).where(eq(posts.id, req.params.id)).returning({ id: posts.id });
      if (done.length === 0) throw new HttpError(404, "Post not found.");
      await resolveReports("post", req.params.id, req.user!.id);
      res.json({ deleted: true });
    })
  );

  router.delete(
    "/admin/post-comments/:id",
    handle(async (req, res) => {
      if (!isId(req.params.id)) throw new HttpError(404, "Comment not found.");
      const done = await getDb().delete(postComments).where(eq(postComments.id, req.params.id)).returning({ id: postComments.id });
      if (done.length === 0) throw new HttpError(404, "Comment not found.");
      await resolveReports("post_comment", req.params.id, req.user!.id);
      res.json({ deleted: true });
    })
  );

  const setSuspended = (suspend: boolean) =>
    handle(async (req, res) => {
      const id = req.params.id;
      if (!isId(id)) throw new HttpError(404, "User not found.");
      if (id === req.user!.id) throw new HttpError(400, "You can't suspend yourself.");
      const db = getDb();
      const [target] = await db.select().from(users).where(eq(users.id, id));
      if (!target) throw new HttpError(404, "User not found.");
      if (target.isAdmin) throw new HttpError(403, "Admins can't be suspended here.");
      await db.update(users).set({ suspendedAt: suspend ? new Date() : null }).where(eq(users.id, id));
      if (suspend) {
        // Signed out everywhere, straight away.
        await endAllSessions(id);
        await resolveReports("user", id, req.user!.id);
      }
      res.json({ suspended: suspend });
    });

  router.post("/admin/users/:id/suspend", setSuspended(true));
  router.post("/admin/users/:id/unsuspend", setSuspended(false));

  return router;
}
