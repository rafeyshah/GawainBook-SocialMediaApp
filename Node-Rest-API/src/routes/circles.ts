import crypto from "crypto";
import { RequestHandler, Response, Router } from "express";
import { and, asc, count, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  books,
  chapters,
  circleMembers,
  circles,
  comments,
  invitations,
  notifications,
  posts,
  reports,
  threads,
  userBooks,
  users,
} from "../db/schema";
import { handle, HttpError, isId } from "../http";
import { requireAuth } from "../auth";
import { blockedIds, canManageMember, canModerate, canPost, canSeeHidden, Role, threadAccess, viewerOf } from "../policy";

const pass: RequestHandler = (req, res, next) => next();

const notFound = () => new HttpError(404, "Circle not found.");
export const newInviteCode = () => crypto.randomBytes(9).toString("base64url"); // 12 chars

export const INVITE_DAYS = { min: 1, max: 30, default: 7 };
export const SEARCH_LIMIT = 20;

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

const authorFields = { _id: users.id, username: users.username, profilePicture: users.profilePicture };

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
  const [members, threadRows, mine, myBooks, blocked] = await Promise.all([
    db
      .select({ circleId: circleMembers.circleId, n: count() })
      .from(circleMembers)
      .where(inArray(circleMembers.circleId, circleIds))
      .groupBy(circleMembers.circleId),
    db
      .select({ circleId: threads.circleId, chapterSeq: threads.chapterSeq, createdAt: threads.createdAt, authorId: threads.authorId })
      .from(threads)
      .where(and(inArray(threads.circleId, circleIds), isNull(threads.hiddenAt))),
    db.select().from(circleMembers).where(and(inArray(circleMembers.circleId, circleIds), eq(circleMembers.userId, me))),
    db.select().from(userBooks).where(eq(userBooks.userId, me)),
    blockedIds(me),
  ]);
  const memberCount = new Map(members.map((m) => [m.circleId, Number(m.n)]));
  const role = new Map(mine.map((m) => [m.circleId, m.role]));
  const progress = new Map(myBooks.map((b) => [b.bookId, b.chapterSeq]));
  const counts = await Promise.all(rows.map((r) => lastChapter(r.book._id)));

  return rows.map((r, i) => {
    const p = progress.get(r.book._id) ?? 0;
    const ts = threadRows.filter((t) => t.circleId === r._id && !blocked.has(t.authorId));
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

type InviteProblem = "expired" | "used" | "revoked";
const INVITE_MESSAGES: Record<InviteProblem, string> = {
  expired: "This invite link has expired. Ask for a new one.",
  used: "This invite link has already been used the maximum number of times.",
  revoked: "This invite link has been turned off.",
};

export function inviteProblem(
  inv: { expiresAt: Date; maxUses: number | null; uses: number; revokedAt: Date | null },
  now = new Date()
): InviteProblem | null {
  if (inv.revokedAt) return "revoked";
  if (inv.expiresAt <= now) return "expired";
  if (inv.maxUses !== null && inv.uses >= inv.maxUses) return "used";
  return null;
}

// Resolves a code to a circle: an invite link first, then the circle's
// permanent code. Throws 404 for unknown codes and 410 for dead links.
async function resolveCode(code: string) {
  const db = getDb();
  const [inv] = await db.select().from(invitations).where(eq(invitations.code, code));
  if (inv) {
    const problem = inviteProblem(inv);
    if (problem) throw new HttpError(410, INVITE_MESSAGES[problem]);
    const [circle] = await db.select().from(circles).where(eq(circles.id, inv.circleId));
    return { circle, invitation: inv };
  }
  const [circle] = await db.select().from(circles).where(eq(circles.inviteCode, code));
  if (!circle) throw new HttpError(404, "That invite code isn't valid.");
  return { circle, invitation: null };
}

const cleanCode = (v: unknown) => {
  const code = String(v ?? "").trim();
  return /^[\w-]{6,64}$/.test(code) ? code : "";
};

// Builds the reply list a reader may see: blocked readers' replies are left
// out; hidden replies are placeholders unless the reader is a moderator.
function visibleComments<
  C extends { body: string; hiddenAt: Date | null; author: { _id: string } }
>(rows: C[], blocked: Set<string>, role: Role | null) {
  return rows
    .filter((c) => !blocked.has(c.author._id))
    .map((c) => {
      if (!c.hiddenAt) return { ...c, hidden: false };
      if (canSeeHidden(role)) return { ...c, hidden: true };
      return { ...c, body: "", author: null, hidden: true };
    });
}

export function circleRouter(limitPosting: RequestHandler = pass) {
  const router = Router();
  // Only this router's own paths: it's mounted at /api next to public routes.
  router.use(["/circles", "/threads", "/comments", "/invitations", "/reports"], requireAuth);

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

  // What an invite leads to, so the join page can say "You're invited to …".
  router.get(
    "/invitations/:code",
    handle(async (req, res) => {
      const code = cleanCode(req.params.code);
      if (!code) throw new HttpError(404, "That invite code isn't valid.");
      const { circle, invitation } = await resolveCode(code);
      const [card] = await circleCards([circle.id], req.user!.id);
      res.json({
        circle: { _id: card._id, name: card.name, description: card.description, visibility: card.visibility, book: card.book, memberCount: card.memberCount },
        alreadyMember: card.myRole !== null,
        expiresAt: invitation?.expiresAt ?? null,
      });
    })
  );

  // Join with an invite link code or a circle's permanent code.
  router.post(
    "/circles/join",
    handle(async (req, res) => {
      const code = cleanCode(req.body.code);
      if (!code) throw new HttpError(404, "That invite code isn't valid.");
      const { circle, invitation } = await resolveCode(code);
      const me = req.user!.id;
      await getDb().transaction(async (tx) => {
        const inserted = await tx
          .insert(circleMembers)
          .values({ circleId: circle.id, userId: me, role: "member" })
          .onConflictDoNothing()
          .returning({ id: circleMembers.userId });
        if (inserted.length === 0) throw new HttpError(409, "You're already in this circle.");
        if (invitation) {
          // Count the use atomically, so two people can't take the last place.
          const used = await tx
            .update(invitations)
            .set({ uses: sql`${invitations.uses} + 1` })
            .where(
              and(
                eq(invitations.id, invitation.id),
                isNull(invitations.revokedAt),
                gt(invitations.expiresAt, new Date()),
                or(isNull(invitations.maxUses), sql`${invitations.uses} < ${invitations.maxUses}`)
              )
            )
            .returning({ id: invitations.id });
          if (used.length === 0) throw new HttpError(410, INVITE_MESSAGES.used);
        }
      });
      res.status(201).json({ circleId: circle.id });
    })
  );

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
          ...authorFields,
          role: circleMembers.role,
          chapter: sql<number>`coalesce(${userBooks.chapterSeq}, 0)::int`,
        })
        .from(circleMembers)
        .innerJoin(users, eq(users.id, circleMembers.userId))
        .leftJoin(userBooks, and(eq(userBooks.userId, users.id), eq(userBooks.bookId, circle.bookId)))
        .where(eq(circleMembers.circleId, circle.id))
        .orderBy(asc(users.username));
      let openReports = 0;
      if (canModerate(viewer.role)) {
        const [r] = await db
          .select({ n: count() })
          .from(reports)
          .where(and(eq(reports.circleId, circle.id), eq(reports.status, "open")));
        openReports = Number(r.n);
      }
      res.json({
        ...card,
        ownerId: circle.ownerId,
        // Members see where everyone is; visitors to a public circle don't.
        members: viewer.role ? memberRows : memberRows.map(({ chapter: _c, ...m }) => m),
        inviteCode: canModerate(viewer.role) ? circle.inviteCode : undefined,
        openReports: canModerate(viewer.role) ? openReports : undefined,
      });
    })
  );

  router.post(
    "/circles/:id/join",
    handle(async (req, res) => {
      const circle = await findCircle(req.params.id);
      // Private circles are joined with a code (POST /circles/join), never by id.
      if (!circle || circle.visibility !== "public") throw notFound();
      const inserted = await getDb()
        .insert(circleMembers)
        .values({ circleId: circle.id, userId: req.user!.id, role: "member" })
        .onConflictDoNothing()
        .returning({ id: circleMembers.userId });
      if (inserted.length === 0) throw new HttpError(409, "You're already in this circle.");
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

  // ---------- Members: roles and removal ----------

  async function memberTarget(req: { params: Record<string, string>; user?: { id: string } }) {
    const circle = await findCircle(req.params.id);
    if (!circle) throw notFound();
    const viewer = await viewerOf(circle, req.user!.id);
    if (!viewer.visible) throw notFound();
    if (!isId(req.params.userId)) throw new HttpError(404, "Member not found.");
    const [target] = await getDb()
      .select()
      .from(circleMembers)
      .where(and(eq(circleMembers.circleId, circle.id), eq(circleMembers.userId, req.params.userId)));
    if (!target) throw new HttpError(404, "Member not found.");
    return { circle, viewer, target: target.role as Role };
  }

  // Owners make members moderators and back again.
  router.put(
    "/circles/:id/members/:userId",
    handle(async (req, res) => {
      const { circle, viewer, target } = await memberTarget(req);
      const role = req.body.role;
      if (!["moderator", "member"].includes(role)) throw new HttpError(400, "Role must be moderator or member.");
      if (!canManageMember(viewer.role, target, "role")) throw new HttpError(403, "Only the circle's owner can change roles.");
      await getDb()
        .update(circleMembers)
        .set({ role })
        .where(and(eq(circleMembers.circleId, circle.id), eq(circleMembers.userId, req.params.userId)));
      res.json({ userId: req.params.userId, role });
    })
  );

  // Owners remove anyone but themselves; moderators remove members.
  router.delete(
    "/circles/:id/members/:userId",
    handle(async (req, res) => {
      const { circle, viewer, target } = await memberTarget(req);
      if (req.params.userId === req.user!.id) throw new HttpError(400, "To leave the circle, use Leave.");
      if (!canManageMember(viewer.role, target, "remove")) throw new HttpError(403, "You can't remove this member.");
      await getDb()
        .delete(circleMembers)
        .where(and(eq(circleMembers.circleId, circle.id), eq(circleMembers.userId, req.params.userId)));
      res.json({ removed: true });
    })
  );

  // ---------- Invite links ----------

  async function moderatedCircle(id: string, me: string) {
    const circle = await findCircle(id);
    if (!circle) throw notFound();
    const viewer = await viewerOf(circle, me);
    if (!viewer.visible) throw notFound();
    if (!canModerate(viewer.role)) throw new HttpError(403, "Only the circle's owner and moderators can do that.");
    return { circle, viewer };
  }

  router.post(
    "/circles/:id/invitations",
    handle(async (req, res) => {
      const { circle } = await moderatedCircle(req.params.id, req.user!.id);
      const days = req.body.expiresInDays ?? INVITE_DAYS.default;
      const maxUses = req.body.maxUses ?? null;
      if (!Number.isInteger(days) || days < INVITE_DAYS.min || days > INVITE_DAYS.max) {
        throw new HttpError(400, `Links can last ${INVITE_DAYS.min}–${INVITE_DAYS.max} days.`);
      }
      if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100)) {
        throw new HttpError(400, "A link can be used 1–100 times, or leave it unlimited.");
      }
      const [inv] = await getDb()
        .insert(invitations)
        .values({
          circleId: circle.id,
          code: newInviteCode(),
          createdBy: req.user!.id,
          expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
          maxUses,
        })
        .returning();
      res.status(201).json({ _id: inv.id, code: inv.code, expiresAt: inv.expiresAt, maxUses: inv.maxUses, uses: inv.uses });
    })
  );

  router.get(
    "/circles/:id/invitations",
    handle(async (req, res) => {
      const { circle } = await moderatedCircle(req.params.id, req.user!.id);
      const rows = await getDb()
        .select()
        .from(invitations)
        .where(and(eq(invitations.circleId, circle.id), isNull(invitations.revokedAt), gt(invitations.expiresAt, new Date())))
        .orderBy(desc(invitations.createdAt));
      res.json(
        rows
          .filter((i) => !inviteProblem(i))
          .map((i) => ({ _id: i.id, code: i.code, expiresAt: i.expiresAt, maxUses: i.maxUses, uses: i.uses }))
      );
    })
  );

  router.delete(
    "/circles/:id/invitations/:invId",
    handle(async (req, res) => {
      const { circle } = await moderatedCircle(req.params.id, req.user!.id);
      if (!isId(req.params.invId)) throw new HttpError(404, "Invite link not found.");
      const done = await getDb()
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(and(eq(invitations.id, req.params.invId), eq(invitations.circleId, circle.id), isNull(invitations.revokedAt)))
        .returning({ id: invitations.id });
      if (done.length === 0) throw new HttpError(404, "Invite link not found.");
      res.json({ revoked: true });
    })
  );

  // ---------- Discussions ----------

  // Discussion list. Threads past your chapter come back as locked
  // placeholders: chapter number only, never the title, author or text.
  router.get(
    "/circles/:id/threads",
    handle(async (req, res) => {
      const circle = await findCircle(req.params.id);
      if (!circle) throw notFound();
      const viewer = await viewerOf(circle, req.user!.id);
      if (!viewer.visible) throw notFound();
      const mod = canSeeHidden(viewer.role);

      const rows = await getDb()
        .select({
          _id: threads.id,
          chapterSeq: threads.chapterSeq,
          title: threads.title,
          createdAt: threads.createdAt,
          hiddenAt: threads.hiddenAt,
          author: authorFields,
          commentCount: sql<number>`(select count(*)::int from ${comments} where ${comments.threadId} = ${threads.id} and ${comments.hiddenAt} is null)`,
        })
        .from(threads)
        .innerJoin(users, eq(users.id, threads.authorId))
        .where(and(eq(threads.circleId, circle.id), mod ? undefined : isNull(threads.hiddenAt)))
        .orderBy(asc(threads.chapterSeq), desc(threads.createdAt));
      const out = [];
      for (const { hiddenAt, ...t } of rows) {
        const access = threadAccess(circle, viewer.role, viewer.progress, t.chapterSeq, viewer.blocked.has(t.author._id));
        if (access === "hidden") continue;
        out.push(access === "open" ? { ...t, locked: false, hidden: Boolean(hiddenAt) } : { _id: t._id, chapterSeq: t.chapterSeq, locked: true });
      }
      res.json(out);
    })
  );

  router.post(
    "/circles/:id/threads",
    limitPosting,
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

  // Search the discussions you're allowed to read: the same rule as the
  // list, applied in SQL (chapter <= your progress), so later chapters
  // never match.
  router.get(
    "/circles/:id/search",
    handle(async (req, res) => {
      const circle = await findCircle(req.params.id);
      if (!circle) throw notFound();
      const viewer = await viewerOf(circle, req.user!.id);
      if (!viewer.visible) throw notFound();
      const q = String(req.query.q ?? "").trim();
      if (q.length < 2 || q.length > 100) throw new HttpError(400, "Search for 2–100 characters.");
      const pattern = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
      const blocked = [...viewer.blocked];
      const notBlocked = (col: typeof threads.authorId | typeof comments.authorId) =>
        blocked.length ? sql`${col} <> all(${sql.param(blocked)}::text[])` : undefined;

      const db = getDb();
      const base = and(eq(threads.circleId, circle.id), lte(threads.chapterSeq, viewer.progress), isNull(threads.hiddenAt), notBlocked(threads.authorId));
      const threadHits = await db
        .select({ threadId: threads.id, title: threads.title, chapterSeq: threads.chapterSeq, text: threads.body, createdAt: threads.createdAt })
        .from(threads)
        .where(and(base, or(sql`${threads.title} ilike ${pattern}`, sql`${threads.body} ilike ${pattern}`)))
        .limit(SEARCH_LIMIT);
      const commentHits = await db
        .select({ threadId: threads.id, title: threads.title, chapterSeq: threads.chapterSeq, text: comments.body, createdAt: comments.createdAt })
        .from(comments)
        .innerJoin(threads, eq(threads.id, comments.threadId))
        .where(and(base, isNull(comments.hiddenAt), notBlocked(comments.authorId), sql`${comments.body} ilike ${pattern}`))
        .limit(SEARCH_LIMIT);
      const results = [...threadHits, ...commentHits]
        .sort((a, b) => a.chapterSeq - b.chapterSeq || +b.createdAt - +a.createdAt)
        .slice(0, SEARCH_LIMIT)
        .map(({ text, createdAt: _c, ...r }) => ({ ...r, snippet: snippet(text, q) }));
      res.json({ query: q, results });
    })
  );

  // Loads a thread and applies the access rule. Returns null (and responds)
  // when the reader may not see it.
  async function openThread(threadId: string, userId: string, res: Response) {
    if (!isId(threadId)) throw new HttpError(404, "Discussion not found.");
    const db = getDb();
    const [thread] = await db.select().from(threads).where(eq(threads.id, threadId));
    const [circle] = thread ? await db.select().from(circles).where(eq(circles.id, thread.circleId)) : [];
    if (!thread || !circle) throw new HttpError(404, "Discussion not found.");
    const viewer = await viewerOf(circle, userId);
    const access = threadAccess(circle, viewer.role, viewer.progress, thread.chapterSeq, viewer.blocked.has(thread.authorId));
    if (access === "hidden" || (thread.hiddenAt && !canSeeHidden(viewer.role))) throw new HttpError(404, "Discussion not found.");
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
      const [authorRow] = await db.select(authorFields).from(users).where(eq(users.id, thread.authorId));
      const commentRows = await db
        .select({
          _id: comments.id,
          body: comments.body,
          createdAt: comments.createdAt,
          editedAt: comments.editedAt,
          hiddenAt: comments.hiddenAt,
          author: authorFields,
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
        editedAt: thread.editedAt,
        hidden: Boolean(thread.hiddenAt),
        author: authorRow,
        circle: { _id: circle.id, name: circle.name },
        comments: visibleComments(commentRows, viewer.blocked, viewer.role).map(({ hiddenAt: _h, ...c }) => c),
        canReply: canPost(viewer.role),
        canModerate: canModerate(viewer.role),
      });
    })
  );

  // Edit your own discussion's title and text.
  router.patch(
    "/threads/:id",
    limitPosting,
    handle(async (req, res) => {
      const found = await openThread(req.params.id, req.user!.id, res);
      if (!found) return;
      if (found.thread.authorId !== req.user!.id) throw new HttpError(403, "You can only edit your own discussions.");
      const title = req.body.title === undefined ? found.thread.title : String(req.body.title).trim();
      const body = req.body.body === undefined ? found.thread.body : String(req.body.body).trim();
      if (title.length < 3 || title.length > 120) throw new HttpError(400, "Titles must be 3–120 characters.");
      if (body.length > 4000) throw new HttpError(400, "The text can be at most 4000 characters.");
      const [t] = await getDb().update(threads).set({ title, body, editedAt: new Date() }).where(eq(threads.id, found.thread.id)).returning();
      res.json({ _id: t.id, title: t.title, body: t.body, editedAt: t.editedAt });
    })
  );

  // Delete your own discussion; owners and moderators can delete any.
  router.delete(
    "/threads/:id",
    handle(async (req, res) => {
      const found = await openThread(req.params.id, req.user!.id, res);
      if (!found) return;
      if (found.thread.authorId !== req.user!.id && !canModerate(found.viewer.role)) {
        throw new HttpError(403, "You can only delete your own discussions.");
      }
      await getDb().delete(threads).where(eq(threads.id, found.thread.id));
      res.json({ deleted: true, circleId: found.circle.id });
    })
  );

  router.post(
    "/threads/:id/comments",
    limitPosting,
    handle(async (req, res) => {
      const found = await openThread(req.params.id, req.user!.id, res);
      if (!found) return;
      if (!canPost(found.viewer.role)) throw new HttpError(403, "Join the circle to reply.");
      const body = String(req.body.body ?? "").trim();
      if (!body) throw new HttpError(400, "Write something first.");
      if (body.length > 2000) throw new HttpError(400, "Replies can be at most 2000 characters.");
      const me = req.user!.id;
      const db = getDb();
      const comment = await db.transaction(async (tx) => {
        const [c] = await tx.insert(comments).values({ threadId: found.thread.id, authorId: me, body }).returning();
        // Tell the discussion's author (never yourself).
        if (found.thread.authorId !== me) {
          await tx.insert(notifications).values({ userId: found.thread.authorId, type: "reply", actorId: me, threadId: found.thread.id, commentId: c.id });
        }
        return c;
      });
      res.status(201).json({
        _id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt,
        editedAt: null,
        hidden: false,
        author: { _id: me, username: req.user!.username, profilePicture: req.user!.profilePicture },
      });
    })
  );

  async function findComment(id: string, me: string, res: Response) {
    if (!isId(id)) throw new HttpError(404, "Reply not found.");
    const [comment] = await getDb().select().from(comments).where(eq(comments.id, id));
    if (!comment) throw new HttpError(404, "Reply not found.");
    const found = await openThread(comment.threadId, me, res);
    if (!found) return null;
    // A reply from someone you've blocked (or who blocked you) doesn't exist for you.
    if (found.viewer.blocked.has(comment.authorId)) throw new HttpError(404, "Reply not found.");
    return { comment, ...found };
  }

  // Edit your own reply.
  router.patch(
    "/comments/:id",
    limitPosting,
    handle(async (req, res) => {
      const found = await findComment(req.params.id, req.user!.id, res);
      if (!found) return;
      if (found.comment.authorId !== req.user!.id) throw new HttpError(403, "You can only edit your own replies.");
      if (found.comment.hiddenAt) throw new HttpError(403, "A moderator has hidden this reply.");
      const body = String(req.body.body ?? "").trim();
      if (!body) throw new HttpError(400, "Write something first.");
      if (body.length > 2000) throw new HttpError(400, "Replies can be at most 2000 characters.");
      const [c] = await getDb().update(comments).set({ body, editedAt: new Date() }).where(eq(comments.id, found.comment.id)).returning();
      res.json({ _id: c.id, body: c.body, editedAt: c.editedAt });
    })
  );

  // Delete your own reply; owners and moderators can delete any reply.
  router.delete(
    "/comments/:id",
    handle(async (req, res) => {
      const found = await findComment(req.params.id, req.user!.id, res);
      if (!found) return;
      if (found.comment.authorId !== req.user!.id && !canModerate(found.viewer.role)) {
        throw new HttpError(403, "You can only delete your own replies.");
      }
      await getDb().delete(comments).where(eq(comments.id, found.comment.id));
      res.json({ deleted: true });
    })
  );

  // ---------- Moderation: hide and unhide ----------

  // A discussion or reply the reader can read, as one shape.
  async function findTarget(kind: "thread" | "comment", id: unknown, me: string, res: Response) {
    if (kind === "thread") {
      const f = await openThread(String(id ?? ""), me, res);
      return f && { circle: f.circle, viewer: f.viewer, id: f.thread.id, authorId: f.thread.authorId };
    }
    const f = await findComment(String(id ?? ""), me, res);
    return f && { circle: f.circle, viewer: f.viewer, id: f.comment.id, authorId: f.comment.authorId };
  }

  const setHidden = (kind: "thread" | "comment", hide: boolean) =>
    handle(async (req, res) => {
      const me = req.user!.id;
      const found = await findTarget(kind, req.params.id, me, res);
      if (!found) return;
      if (!canModerate(found.viewer.role)) throw new HttpError(403, "Only the circle's owner and moderators can hide content.");
      const db = getDb();
      const values = hide ? { hiddenAt: new Date(), hiddenBy: me } : { hiddenAt: null, hiddenBy: null };
      const targetId = found.id;
      await db.transaction(async (tx) => {
        if (kind === "thread") await tx.update(threads).set(values).where(eq(threads.id, targetId));
        else await tx.update(comments).set(values).where(eq(comments.id, targetId));
        // Hiding settles any open reports about it.
        if (hide) {
          await tx
            .update(reports)
            .set({ status: "hidden", resolvedBy: me, resolvedAt: new Date() })
            .where(and(eq(reports.targetType, kind), eq(reports.targetId, targetId), eq(reports.status, "open")));
        }
      });
      res.json({ hidden: hide });
    });

  router.post("/threads/:id/hide", setHidden("thread", true));
  router.post("/threads/:id/unhide", setHidden("thread", false));
  router.post("/comments/:id/hide", setHidden("comment", true));
  router.post("/comments/:id/unhide", setHidden("comment", false));

  // ---------- Reports ----------

  router.post(
    "/reports",
    limitPosting,
    handle(async (req, res) => {
      const me = req.user!.id;
      const { targetType, targetId } = req.body;
      const reason = req.body.reason;
      const details = String(req.body.details ?? "").trim();
      if (!["thread", "comment", "post", "user"].includes(targetType)) throw new HttpError(400, "You can report a discussion, a reply, a post or a profile.");
      if (!["spoiler", "harassment", "spam", "other"].includes(reason)) throw new HttpError(400, "Choose a reason.");
      if (details.length > 500) throw new HttpError(400, "Details can be at most 500 characters.");
      // Posts and profiles live outside circles: their reports go to the site's admins.
      if (targetType === "post" || targetType === "user") {
        if (!isId(targetId)) throw new HttpError(404, targetType === "post" ? "Post not found." : "User not found.");
        const db = getDb();
        let authorId: string | undefined;
        if (targetType === "post") {
          const [p] = await db.select({ userId: posts.userId }).from(posts).where(eq(posts.id, targetId));
          authorId = p?.userId;
        } else {
          const [u] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, targetId), isNull(users.suspendedAt)));
          authorId = u?.id;
        }
        if (!authorId || (await blockedIds(me)).has(authorId)) throw new HttpError(404, targetType === "post" ? "Post not found." : "User not found.");
        if (authorId === me) throw new HttpError(400, "You can't report yourself.");
        const [r] = await db
          .insert(reports)
          .values({ reporterId: me, circleId: null, targetType, targetId, reason, details })
          .onConflictDoNothing()
          .returning({ id: reports.id });
        if (!r) throw new HttpError(409, "You've already reported this. We'll take a look.");
        res.status(201).json({ _id: r.id, status: "open" });
        return;
      }
      // You can only report what you can read.
      const found = await findTarget(targetType, targetId, me, res);
      if (!found) return;
      if (found.authorId === me) throw new HttpError(400, "You can't report your own writing.");
      const [r] = await getDb()
        .insert(reports)
        .values({ reporterId: me, circleId: found.circle.id, targetType, targetId: found.id, reason, details })
        .onConflictDoNothing()
        .returning({ id: reports.id });
      if (!r) throw new HttpError(409, "You've already reported this. The moderators will take a look.");
      res.status(201).json({ _id: r.id, status: "open" });
    })
  );

  // Open reports for a circle's moderators, with the reported text.
  router.get(
    "/circles/:id/reports",
    handle(async (req, res) => {
      const { circle } = await moderatedCircle(req.params.id, req.user!.id);
      const db = getDb();
      const rows = await db
        .select({
          _id: reports.id,
          targetType: reports.targetType,
          targetId: reports.targetId,
          reason: reports.reason,
          details: reports.details,
          createdAt: reports.createdAt,
          reporter: authorFields,
        })
        .from(reports)
        .innerJoin(users, eq(users.id, reports.reporterId))
        .where(and(eq(reports.circleId, circle.id), eq(reports.status, "open")))
        .orderBy(asc(reports.createdAt));
      const out = [];
      for (const r of rows) {
        let target: Record<string, unknown> | null = null;
        if (r.targetType === "thread") {
          const [t] = await db
            .select({ _id: threads.id, title: threads.title, text: threads.body, chapterSeq: threads.chapterSeq, author: authorFields })
            .from(threads)
            .innerJoin(users, eq(users.id, threads.authorId))
            .where(eq(threads.id, r.targetId));
          if (t) target = { ...t, threadId: t._id };
        } else {
          const [c] = await db
            .select({ _id: comments.id, text: comments.body, threadId: comments.threadId, chapterSeq: threads.chapterSeq, author: authorFields })
            .from(comments)
            .innerJoin(threads, eq(threads.id, comments.threadId))
            .innerJoin(users, eq(users.id, comments.authorId))
            .where(eq(comments.id, r.targetId));
          if (c) target = c;
        }
        if (target) out.push({ ...r, target });
      }
      res.json(out);
    })
  );

  router.post(
    "/reports/:id/dismiss",
    handle(async (req, res) => {
      if (!isId(req.params.id)) throw new HttpError(404, "Report not found.");
      const db = getDb();
      const [r] = await db.select().from(reports).where(eq(reports.id, req.params.id));
      // Site-wide reports are handled by admins (see routes/admin.ts).
      if (!r || !r.circleId) throw new HttpError(404, "Report not found.");
      await moderatedCircle(r.circleId, req.user!.id);
      if (r.status !== "open") throw new HttpError(409, "This report has already been handled.");
      await db.update(reports).set({ status: "dismissed", resolvedBy: req.user!.id, resolvedAt: new Date() }).where(eq(reports.id, r.id));
      res.json({ status: "dismissed" });
    })
  );

  return router;
}

// A short excerpt around the first match.
export function snippet(text: string, q: string, radius = 60): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const at = flat.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return flat.slice(0, radius * 2) + (flat.length > radius * 2 ? "…" : "");
  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + q.length + radius);
  return (start > 0 ? "…" : "") + flat.slice(start, end) + (end < flat.length ? "…" : "");
}

export default circleRouter;
