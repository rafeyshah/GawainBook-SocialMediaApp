import crypto from "crypto";
import { Router } from "express";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { books, chapters, circleMembers, circles, comments, threads, userBooks, users } from "../db/schema";
import { handle, HttpError, isId } from "../http";
import { requireAuth } from "../auth";
import { canModerate, canPost, threadAccess, viewerOf } from "../policy";

const router = Router();
// Only this router's own paths: it's mounted at /api next to public routes.
router.use(["/circles", "/threads", "/comments"], requireAuth);

const notFound = () => new HttpError(404, "Circle not found.");
export const newInviteCode = () => crypto.randomBytes(9).toString("base64url"); // 12 chars

async function findCircle(id: unknown) {
  if (!isId(id)) return undefined;
  const [circle] = await getDb().select().from(circles).where(eq(circles.id, id));
  return circle;
}

async function lastChapter(bookId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`coalesce(max(${chapters.seq}), 0)::int` })
    .from(chapters)
    .where(eq(chapters.bookId, bookId));
  return row.n;
}

// Card data for a list of circles, from one reader's point of view.
async function circleCards(circleIds: string[], me: string) {
  if (circleIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({
      _id: circles.id,
      name: circles.name,
      description: circles.description,
      visibility: circles.visibility,
      schedule: circles.schedule,
      book: { _id: books.id, slug: books.slug, title: books.title, author: books.author, coverColor: books.coverColor },
    })
    .from(circles)
    .innerJoin(books, eq(books.id, circles.bookId))
    .where(inArray(circles.id, circleIds));
  const [members, threadRows, mine, myBooks] = await Promise.all([
    db
      .select({ circleId: circleMembers.circleId, n: count() })
      .from(circleMembers)
      .where(inArray(circleMembers.circleId, circleIds))
      .groupBy(circleMembers.circleId),
    db
      .select({ circleId: threads.circleId, chapterSeq: threads.chapterSeq, createdAt: threads.createdAt })
      .from(threads)
      .where(inArray(threads.circleId, circleIds)),
    db.select().from(circleMembers).where(and(inArray(circleMembers.circleId, circleIds), eq(circleMembers.userId, me))),
    db.select().from(userBooks).where(eq(userBooks.userId, me)),
  ]);
  const memberCount = new Map(members.map((m) => [m.circleId, Number(m.n)]));
  const role = new Map(mine.map((m) => [m.circleId, m.role]));
  const progress = new Map(myBooks.map((b) => [b.bookId, b.chapterSeq]));
  const counts = await Promise.all(rows.map((r) => lastChapter(r.book._id)));

  return rows.map((r, i) => {
    const p = progress.get(r.book._id) ?? 0;
    const ts = threadRows.filter((t) => t.circleId === r._id);
    const open = ts.filter((t) => t.chapterSeq <= p);
    return {
      ...r,
      book: { ...r.book, chapterCount: counts[i] },
      memberCount: memberCount.get(r._id) ?? 0,
      myRole: role.get(r._id) ?? null,
      myProgress: p,
      openThreads: open.length,
      lockedThreads: ts.length - open.length,
      lastActivity: open.reduce<Date | null>((latest, t) => (!latest || t.createdAt > latest ? t.createdAt : latest), null),
    };
  });
}

// Your circles, plus public circles you could join.
router.get(
  "/circles",
  handle(async (req, res) => {
    const db = getDb();
    const me = req.user!.id;
    const mineIds = (await db.select({ id: circleMembers.circleId }).from(circleMembers).where(eq(circleMembers.userId, me))).map((r) => r.id);
    const publicIds = (await db.select({ id: circles.id }).from(circles).where(eq(circles.visibility, "public"))).map((r) => r.id);
    const [mine, discover] = await Promise.all([
      circleCards(mineIds, me),
      circleCards(publicIds.filter((id) => !mineIds.includes(id)), me),
    ]);
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    res.json({ mine: mine.sort(byName), discover: discover.sort((a, b) => b.memberCount - a.memberCount) });
  })
);

router.post(
  "/circles",
  handle(async (req, res) => {
    const name = String(req.body.name ?? "").trim();
    const description = String(req.body.description ?? "").trim();
    const schedule = String(req.body.schedule ?? "").trim();
    const visibility = req.body.visibility ?? "public";
    if (name.length < 3 || name.length > 60) throw new HttpError(400, "Circle names must be 3–60 characters.");
    if (description.length > 500) throw new HttpError(400, "The description can be at most 500 characters.");
    if (schedule.length > 120) throw new HttpError(400, "The schedule can be at most 120 characters.");
    if (!["public", "private"].includes(visibility)) throw new HttpError(400, "Visibility must be public or private.");
    if (!isId(req.body.bookId)) throw new HttpError(400, "Choose a book.");

    const db = getDb();
    const [book] = await db.select({ id: books.id }).from(books).where(eq(books.id, req.body.bookId));
    if (!book) throw new HttpError(400, "Choose a book.");
    const me = req.user!.id;

    const circle = await db.transaction(async (tx) => {
      const [c] = await tx
        .insert(circles)
        .values({ name, description, schedule, visibility, bookId: book.id, ownerId: me, inviteCode: newInviteCode() })
        .returning();
      await tx.insert(circleMembers).values({ circleId: c.id, userId: me, role: "owner" });
      // Starting a circle puts its book on your "reading" shelf.
      await tx.insert(userBooks).values({ userId: me, bookId: book.id, shelf: "reading" }).onConflictDoNothing();
      return c;
    });
    res.status(201).json((await circleCards([circle.id], me))[0]);
  })
);

// Join a private circle with its invite code.
router.post(
  "/circles/join",
  handle(async (req, res) => {
    const code = String(req.body.code ?? "").trim();
    const [circle] = code ? await getDb().select().from(circles).where(eq(circles.inviteCode, code)) : [];
    if (!circle) throw new HttpError(404, "That invite code isn't valid.");
    await join(circle.id, req.user!.id);
    res.status(201).json({ circleId: circle.id });
  })
);

async function join(circleId: string, userId: string) {
  const inserted = await getDb()
    .insert(circleMembers)
    .values({ circleId, userId, role: "member" })
    .onConflictDoNothing()
    .returning({ id: circleMembers.userId });
  if (inserted.length === 0) throw new HttpError(409, "You're already in this circle.");
}

router.get(
  "/circles/:id",
  handle(async (req, res) => {
    const circle = await findCircle(req.params.id);
    if (!circle) throw notFound();
    const me = req.user!.id;
    const viewer = await viewerOf(circle, me);
    // Private circles don't reveal that they exist to non-members.
    if (!viewer.visible) throw notFound();

    const db = getDb();
    const [card] = await circleCards([circle.id], me);
    const memberRows = await db
      .select({
        _id: users.id,
        username: users.username,
        profilePicture: users.profilePicture,
        role: circleMembers.role,
        chapter: sql<number>`coalesce(${userBooks.chapterSeq}, 0)::int`,
      })
      .from(circleMembers)
      .innerJoin(users, eq(users.id, circleMembers.userId))
      .leftJoin(userBooks, and(eq(userBooks.userId, users.id), eq(userBooks.bookId, circle.bookId)))
      .where(eq(circleMembers.circleId, circle.id))
      .orderBy(asc(users.username));
    res.json({
      ...card,
      ownerId: circle.ownerId,
      // Members see where everyone is; visitors to a public circle don't.
      members: viewer.role ? memberRows : memberRows.map(({ chapter: _c, ...m }) => m),
      inviteCode: canModerate(viewer.role) ? circle.inviteCode : undefined,
    });
  })
);

router.post(
  "/circles/:id/join",
  handle(async (req, res) => {
    const circle = await findCircle(req.params.id);
    // Private circles are joined with a code (POST /circles/join), never by id.
    if (!circle || circle.visibility !== "public") throw notFound();
    await join(circle.id, req.user!.id);
    res.status(201).json({ circleId: circle.id });
  })
);

router.post(
  "/circles/:id/leave",
  handle(async (req, res) => {
    const circle = await findCircle(req.params.id);
    if (!circle) throw notFound();
    const viewer = await viewerOf(circle, req.user!.id);
    if (!viewer.visible) throw notFound();
    if (viewer.role === "owner") throw new HttpError(403, "Owners can't leave their own circle.");
    if (!viewer.role) throw new HttpError(409, "You're not in this circle.");
    await getDb()
      .delete(circleMembers)
      .where(and(eq(circleMembers.circleId, circle.id), eq(circleMembers.userId, req.user!.id)));
    res.json({ left: true });
  })
);

// Discussion list. Threads past your chapter come back as locked
// placeholders: chapter number only, never the title, author or text.
router.get(
  "/circles/:id/threads",
  handle(async (req, res) => {
    const circle = await findCircle(req.params.id);
    if (!circle) throw notFound();
    const viewer = await viewerOf(circle, req.user!.id);
    if (!viewer.visible) throw notFound();

    const db = getDb();
    const rows = await db
      .select({
        _id: threads.id,
        chapterSeq: threads.chapterSeq,
        title: threads.title,
        createdAt: threads.createdAt,
        author: { _id: users.id, username: users.username, profilePicture: users.profilePicture },
        commentCount: sql<number>`(select count(*)::int from ${comments} where ${comments.threadId} = ${threads.id})`,
      })
      .from(threads)
      .innerJoin(users, eq(users.id, threads.authorId))
      .where(eq(threads.circleId, circle.id))
      .orderBy(asc(threads.chapterSeq), desc(threads.createdAt));
    res.json(
      rows.map((t) =>
        threadAccess(circle, viewer.role, viewer.progress, t.chapterSeq) === "open"
          ? { ...t, locked: false }
          : { _id: t._id, chapterSeq: t.chapterSeq, locked: true }
      )
    );
  })
);

router.post(
  "/circles/:id/threads",
  handle(async (req, res) => {
    const circle = await findCircle(req.params.id);
    if (!circle) throw notFound();
    const viewer = await viewerOf(circle, req.user!.id);
    if (!viewer.visible) throw notFound();
    if (!canPost(viewer.role)) throw new HttpError(403, "Join the circle to start a discussion.");

    const title = String(req.body.title ?? "").trim();
    const body = String(req.body.body ?? "").trim();
    const chapter = req.body.chapter;
    const last = await lastChapter(circle.bookId);
    if (!Number.isInteger(chapter) || chapter < 0 || chapter > last) throw new HttpError(400, `Chapter must be between 0 and ${last}.`);
    // You can't open a discussion for a chapter you haven't reached.
    if (chapter > viewer.progress) throw new HttpError(403, `You're on chapter ${viewer.progress}. Reach chapter ${chapter} to discuss it.`);
    if (title.length < 3 || title.length > 120) throw new HttpError(400, "Titles must be 3–120 characters.");
    if (body.length > 4000) throw new HttpError(400, "The text can be at most 4000 characters.");

    const [thread] = await getDb()
      .insert(threads)
      .values({ circleId: circle.id, chapterSeq: chapter, authorId: req.user!.id, title, body })
      .returning();
    res.status(201).json({ _id: thread.id, chapterSeq: thread.chapterSeq, title: thread.title, locked: false });
  })
);

// Loads a thread and applies the access rule. Returns null (and responds)
// when the reader may not see it.
async function openThread(threadId: string, userId: string, res: import("express").Response) {
  if (!isId(threadId)) throw new HttpError(404, "Discussion not found.");
  const db = getDb();
  const [thread] = await db.select().from(threads).where(eq(threads.id, threadId));
  const [circle] = thread ? await db.select().from(circles).where(eq(circles.id, thread.circleId)) : [];
  if (!thread || !circle) throw new HttpError(404, "Discussion not found.");
  const viewer = await viewerOf(circle, userId);
  const access = threadAccess(circle, viewer.role, viewer.progress, thread.chapterSeq);
  if (access === "hidden") throw new HttpError(404, "Discussion not found.");
  if (access === "locked") {
    // No title, author or text: only the chapter needed to unlock it.
    res.status(403).json({ error: `Reach chapter ${thread.chapterSeq} to read this discussion.`, locked: true, chapterSeq: thread.chapterSeq, circleId: circle.id });
    return null;
  }
  return { thread, circle, viewer };
}

router.get(
  "/threads/:id",
  handle(async (req, res) => {
    const found = await openThread(req.params.id, req.user!.id, res);
    if (!found) return;
    const { thread, circle, viewer } = found;
    const db = getDb();
    const [authorRow] = await db
      .select({ _id: users.id, username: users.username, profilePicture: users.profilePicture })
      .from(users)
      .where(eq(users.id, thread.authorId));
    const commentRows = await db
      .select({
        _id: comments.id,
        body: comments.body,
        createdAt: comments.createdAt,
        author: { _id: users.id, username: users.username, profilePicture: users.profilePicture },
      })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.authorId))
      .where(eq(comments.threadId, thread.id))
      .orderBy(asc(comments.createdAt));
    const [chapterRow] = await db
      .select({ title: chapters.title })
      .from(chapters)
      .where(and(eq(chapters.bookId, circle.bookId), eq(chapters.seq, thread.chapterSeq)));
    res.json({
      _id: thread.id,
      title: thread.title,
      body: thread.body,
      chapterSeq: thread.chapterSeq,
      chapterTitle: chapterRow?.title ?? null,
      createdAt: thread.createdAt,
      author: authorRow,
      circle: { _id: circle.id, name: circle.name },
      comments: commentRows,
      canReply: canPost(viewer.role),
      canModerate: canModerate(viewer.role),
    });
  })
);

router.post(
  "/threads/:id/comments",
  handle(async (req, res) => {
    const found = await openThread(req.params.id, req.user!.id, res);
    if (!found) return;
    if (!canPost(found.viewer.role)) throw new HttpError(403, "Join the circle to reply.");
    const body = String(req.body.body ?? "").trim();
    if (!body) throw new HttpError(400, "Write something first.");
    if (body.length > 2000) throw new HttpError(400, "Replies can be at most 2000 characters.");
    const [comment] = await getDb().insert(comments).values({ threadId: found.thread.id, authorId: req.user!.id, body }).returning();
    res.status(201).json({
      _id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt,
      author: { _id: req.user!.id, username: req.user!.username, profilePicture: req.user!.profilePicture },
    });
  })
);

// Delete your own reply; owners and moderators can delete any reply.
router.delete(
  "/comments/:id",
  handle(async (req, res) => {
    if (!isId(req.params.id)) throw new HttpError(404, "Reply not found.");
    const db = getDb();
    const [comment] = await db.select().from(comments).where(eq(comments.id, req.params.id));
    if (!comment) throw new HttpError(404, "Reply not found.");
    const found = await openThread(comment.threadId, req.user!.id, res);
    if (!found) return;
    if (comment.authorId !== req.user!.id && !canModerate(found.viewer.role)) {
      throw new HttpError(403, "You can only delete your own replies.");
    }
    await db.delete(comments).where(eq(comments.id, comment.id));
    res.json({ deleted: true });
  })
);

export default router;
