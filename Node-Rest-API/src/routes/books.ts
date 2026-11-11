import { Router } from "express";
import { and, asc, count, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { books, chapters, circleMembers, circles, userBooks, users } from "../db/schema";
import { handle, HttpError, isId } from "../http";
import { requireAuth } from "../auth";
import { OpenLibrary } from "../openLibrary";

const router = Router();
// Only this router's own paths: it's mounted at /api next to public routes.
router.use(["/books", "/shelves"], requireAuth);

export const SHELVES = ["want", "reading", "finished"] as const;
export type Shelf = (typeof SHELVES)[number];

const bookSummary = {
  _id: books.id,
  slug: books.slug,
  title: books.title,
  author: books.author,
  publishedYear: books.publishedYear,
  coverColor: books.coverColor,
};

async function chapterCounts(bookIds: string[]): Promise<Map<string, number>> {
  if (bookIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ bookId: chapters.bookId, n: sql<number>`max(${chapters.seq})::int` })
    .from(chapters)
    .where(inArray(chapters.bookId, bookIds))
    .groupBy(chapters.bookId);
  return new Map(rows.map((r) => [r.bookId, r.n]));
}

async function findBook(idOrSlug: string) {
  const db = getDb();
  const cond = isId(idOrSlug) ? or(eq(books.id, idOrSlug), eq(books.slug, idOrSlug)) : eq(books.slug, idOrSlug);
  const [book] = await db.select().from(books).where(cond);
  return book;
}

// All books, with the reader's shelf and progress.
router.get(
  "/books",
  handle(async (req, res) => {
    const db = getDb();
    const rows = await db.select(bookSummary).from(books).orderBy(asc(books.title));
    const counts = await chapterCounts(rows.map((b) => b._id));
    const mine = await db.select().from(userBooks).where(eq(userBooks.userId, req.user!.id));
    const byBook = new Map(mine.map((m) => [m.bookId, m]));
    res.json(
      rows.map((b) => ({
        ...b,
        chapterCount: counts.get(b._id) ?? 0,
        shelf: byBook.get(b._id)?.shelf ?? null,
        chapter: byBook.get(b._id)?.chapterSeq ?? 0,
      }))
    );
  })
);

// One book: details, chapters, the reader's progress and circles reading it.
router.get(
  "/books/:idOrSlug",
  handle(async (req, res) => {
    const book = await findBook(req.params.idOrSlug);
    if (!book) throw new HttpError(404, "Book not found.");
    const db = getDb();
    const me = req.user!.id;
    const [chapterRows, [mine], circleRows] = await Promise.all([
      db.select({ seq: chapters.seq, title: chapters.title }).from(chapters).where(eq(chapters.bookId, book.id)).orderBy(asc(chapters.seq)),
      db.select().from(userBooks).where(and(eq(userBooks.userId, me), eq(userBooks.bookId, book.id))),
      db
        .select({
          _id: circles.id,
          name: circles.name,
          visibility: circles.visibility,
          memberCount: count(circleMembers.userId),
          isMember: sql<boolean>`bool_or(${circleMembers.userId} = ${me})`,
        })
        .from(circles)
        .leftJoin(circleMembers, eq(circleMembers.circleId, circles.id))
        .where(eq(circles.bookId, book.id))
        .groupBy(circles.id)
        .orderBy(asc(circles.name)),
    ]);
    res.json({
      _id: book.id,
      slug: book.slug,
      title: book.title,
      author: book.author,
      publishedYear: book.publishedYear,
      description: book.description,
      coverColor: book.coverColor,
      sourceNote: book.sourceNote,
      chapters: chapterRows,
      chapterCount: chapterRows.length ? chapterRows[chapterRows.length - 1].seq : 0,
      shelf: mine?.shelf ?? null,
      chapter: mine?.chapterSeq ?? 0,
      // Private circles only appear to their members.
      circles: circleRows.filter((c) => c.visibility === "public" || c.isMember),
    });
  })
);

// Put a book on a shelf and/or record progress. Finishing sets progress to
// the last chapter; reaching the last chapter moves the book to "finished".
router.put(
  "/books/:idOrSlug/progress",
  handle(async (req, res) => {
    const book = await findBook(req.params.idOrSlug);
    if (!book) throw new HttpError(404, "Book not found.");
    const db = getDb();
    const me = req.user!.id;
    const last = (await chapterCounts([book.id])).get(book.id) ?? 0;
    const [current] = await db.select().from(userBooks).where(and(eq(userBooks.userId, me), eq(userBooks.bookId, book.id)));

    let shelf: Shelf = (current?.shelf as Shelf) ?? "reading";
    let chapter = current?.chapterSeq ?? 0;
    if (req.body.shelf !== undefined) {
      if (!SHELVES.includes(req.body.shelf)) throw new HttpError(400, "Shelf must be want, reading or finished.");
      shelf = req.body.shelf;
    }
    if (req.body.chapter !== undefined) {
      const n = req.body.chapter;
      if (!Number.isInteger(n) || n < 0 || n > last) throw new HttpError(400, `Chapter must be between 0 and ${last}.`);
      chapter = n;
      if (req.body.shelf === undefined) shelf = chapter >= last ? "finished" : "reading";
    }
    if (shelf === "finished") chapter = last;
    if (shelf === "want" && req.body.chapter === undefined) chapter = 0;

    const [row] = await db
      .insert(userBooks)
      .values({ userId: me, bookId: book.id, shelf, chapterSeq: chapter })
      .onConflictDoUpdate({
        target: [userBooks.userId, userBooks.bookId],
        set: { shelf, chapterSeq: chapter, updatedAt: new Date() },
      })
      .returning();
    res.json({ shelf: row.shelf, chapter: row.chapterSeq, chapterCount: last });
  })
);

router.delete(
  "/books/:idOrSlug/progress",
  handle(async (req, res) => {
    const book = await findBook(req.params.idOrSlug);
    if (!book) throw new HttpError(404, "Book not found.");
    await getDb().delete(userBooks).where(and(eq(userBooks.userId, req.user!.id), eq(userBooks.bookId, book.id)));
    res.json({ shelf: null, chapter: 0 });
  })
);

// Shelves. Your own include chapter progress; other readers' shelves only
// show which books, never how far they are (progress stays private).
router.get(
  "/shelves",
  handle(async (req, res) => {
    const db = getDb();
    let userId = req.user!.id;
    if (typeof req.query.username === "string" && req.query.username) {
      const [u] = await db.select({ id: users.id }).from(users).where(eq(users.username, req.query.username));
      if (!u) throw new HttpError(404, "User not found.");
      userId = u.id;
    }
    const own = userId === req.user!.id;
    const rows = await db
      .select({ ...bookSummary, shelf: userBooks.shelf, chapter: userBooks.chapterSeq, updatedAt: userBooks.updatedAt })
      .from(userBooks)
      .innerJoin(books, eq(books.id, userBooks.bookId))
      .where(eq(userBooks.userId, userId))
      .orderBy(sql`${userBooks.updatedAt} desc`);
    const counts = await chapterCounts(rows.map((r) => r._id));
    const result: Record<Shelf, unknown[]> = { want: [], reading: [], finished: [] };
    for (const r of rows) {
      const { chapter, ...rest } = r;
      result[r.shelf as Shelf].push({ ...rest, chapterCount: counts.get(r._id) ?? 0, ...(own ? { chapter } : {}) });
    }
    res.json(result);
  })
);

// Book search: our own books (chapters available, so circles can read them)
// plus Open Library results for discovery. Open Library being slow or down
// only drops the second list.
export function bookSearchRouter(openLibrary: OpenLibrary) {
  const search = Router();
  search.get(
    "/books/search",
    requireAuth,
    handle(async (req, res) => {
      const q = String(req.query.q ?? "").trim();
      if (q.length < 2 || q.length > 100) throw new HttpError(400, "Search for 2–100 characters.");
      const pattern = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
      const rows = await getDb()
        .select(bookSummary)
        .from(books)
        .where(or(sql`${books.title} ilike ${pattern}`, sql`${books.author} ilike ${pattern}`))
        .orderBy(asc(books.title))
        .limit(10);
      const counts = await chapterCounts(rows.map((b) => b._id));
      const local = rows.map((b) => ({ ...b, chapterCount: counts.get(b._id) ?? 0, chaptersAvailable: (counts.get(b._id) ?? 0) > 0 }));
      let openLibraryResults: Awaited<ReturnType<OpenLibrary["search"]>> = [];
      let openLibraryError = false;
      try {
        // Leave out works we already have, matched by title and author.
        const ours = new Set(local.map((b) => `${b.title}|${b.author}`.toLowerCase()));
        openLibraryResults = (await openLibrary.search(q)).filter((b) => !ours.has(`${b.title}|${b.author}`.toLowerCase()));
      } catch {
        openLibraryError = true;
      }
      res.json({ query: q, local, openLibrary: openLibraryResults, openLibraryError });
    })
  );
  return search;
}

export default router;
