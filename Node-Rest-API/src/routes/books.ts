import { RequestHandler, Router } from "express";
import { and, asc, count, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { books, chapters, circleMembers, circles, threads, userBooks, users } from "../db/schema";
import { handle, HttpError, isId } from "../http";
import { requireAuth } from "../auth";
import { OpenLibrary, WORK_KEY } from "../openLibrary";
import { Gutenberg } from "../gutenberg";

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
  coverUrl: books.coverUrl,
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
      coverUrl: book.coverUrl,
      olWorkId: book.olWorkId,
      subjects: book.subjects,
      pageCount: book.pageCount,
      chaptersSetByReader: Boolean(book.chaptersSetBy),
      gutenbergId: book.gutenbergId,
      minChapterCount: chapterRows.length && circleRows.length ? await lowestAllowedCount(book.id) : 1,
      // Put back Gutenberg's list after a reader changed it.
      canRestoreChapters: Boolean(book.gutenbergId) && Boolean(book.chaptersSetBy),
      // Readers with the book on a shelf can set or correct its chapters,
      // except on books whose list we curated ourselves.
      canSetChapters: chapterRows.length === 0 || chaptersEditable(book),
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

// Covers for books without a cover image: a calm palette, picked by title.
export const COVER_PALETTE = ["#7a3e48", "#2f7553", "#3d5a80", "#8a5a2b", "#5b4a7a", "#2d6a6a", "#7a5c3e", "#4a5a2f"];
export const coverColorFor = (title: string) => {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COVER_PALETTE[h % COVER_PALETTE.length];
};

// "Pride & Prejudice!" -> "pride-prejudice"; empty for titles with no letters or digits.
export const slugify = (title: string) =>
  title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    // At most 60 characters, cut at a word boundary when possible.
    .replace(/^(.{0,60})(?:-.*)?$/s, (all, head) => (all.length <= 60 ? all : head || all.slice(0, 60)))
    .slice(0, 60)
    .replace(/-+$/g, "");

const pass: RequestHandler = (req, res, next) => next();

export const MAX_CHAPTERS = 200;

// Books whose chapter list we curated ourselves (the demo books) are locked.
// Lists that came from Gutenberg or from a reader can be corrected.
export const chaptersEditable = (book: typeof books.$inferSelect) => Boolean(book.olWorkId || book.chaptersSetBy);

// The fewest chapters a book can have without breaking a circle: every
// discussion is about a chapter, and that chapter has to stay.
export async function lowestAllowedCount(bookId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`coalesce(max(${threads.chapterSeq}), 0)::int` })
    .from(threads)
    .innerJoin(circles, eq(circles.id, threads.circleId))
    .where(eq(circles.bookId, bookId));
  return Math.max(1, row.n);
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

// Replaces a book's chapters and keeps every reader's progress inside the book.
async function replaceChapters(tx: Tx, bookId: string, list: { seq: number; title: string }[]) {
  const count = list.length;
  await tx.delete(chapters).where(eq(chapters.bookId, bookId));
  await tx.insert(chapters).values(list.map((c) => ({ bookId, seq: c.seq, title: c.title })));
  // Nobody can be past the last chapter; finished readers end on it.
  await tx.update(userBooks).set({ chapterSeq: sql`least(${userBooks.chapterSeq}, ${count})` }).where(eq(userBooks.bookId, bookId));
  await tx.update(userBooks).set({ chapterSeq: count }).where(and(eq(userBooks.bookId, bookId), eq(userBooks.shelf, "finished")));
}

// Fill in a book's Open Library details (description, subjects, pages) once.
// Best effort: if Open Library is down, try again next time.
export async function fillDetails(book: typeof books.$inferSelect, openLibrary: OpenLibrary) {
  if (!book.olWorkId || book.detailsFetchedAt) return book;
  const key = `/works/${book.olWorkId}`;
  try {
    const [details, work] = await Promise.all([openLibrary.details(key), openLibrary.work(key).catch(() => null)]);
    const [updated] = await getDb()
      .update(books)
      .set({
        description: book.description || details?.description || "",
        subjects: details?.subjects?.length ? details.subjects : book.subjects,
        pageCount: book.pageCount ?? work?.pages ?? null,
        detailsFetchedAt: new Date(),
      })
      .where(eq(books.id, book.id))
      .returning();
    return updated;
  } catch {
    return book;
  }
}

// Give a book from Open Library its real chapter list, from Project Gutenberg
// (public-domain books only). Runs once per book; if Gutenberg is down, it's
// tried again next time. Never replaces chapters the book already has.
export async function fillChapters(book: typeof books.$inferSelect, openLibrary: OpenLibrary, gutenberg: Gutenberg) {
  if (!book.olWorkId || book.chaptersCheckedAt) return book;
  const db = getDb();
  const markChecked = async (extra: Partial<typeof books.$inferInsert> = {}) =>
    (await db.update(books).set({ chaptersCheckedAt: new Date(), ...extra }).where(eq(books.id, book.id)).returning())[0];
  if (((await chapterCounts([book.id])).get(book.id) ?? 0) > 0) return markChecked();
  let found;
  try {
    const work = await openLibrary.work(`/works/${book.olWorkId}`);
    if (!work || work.gutenbergIds.length === 0) return markChecked();
    found = await gutenberg.firstChapters(work.gutenbergIds);
  } catch {
    return book; // try again on the next visit
  }
  if (!found) return markChecked();
  return db.transaction(async (tx) => {
    // Someone may have set chapters in the meantime: theirs stay.
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(chapters).where(eq(chapters.bookId, book.id));
    if (n > 0) {
      return (await tx.update(books).set({ chaptersCheckedAt: new Date() }).where(eq(books.id, book.id)).returning())[0];
    }
    await tx.insert(chapters).values(found!.chapters.map((c) => ({ bookId: book.id, seq: c.seq, title: c.title })));
    const note = `Book details from Open Library (openlibrary.org/works/${book.olWorkId}). Chapter list from Project Gutenberg eBook #${found!.id}.`;
    return (
      await tx
        .update(books)
        .set({ chaptersCheckedAt: new Date(), gutenbergId: found!.id, chaptersSetBy: null, sourceNote: note })
        .where(eq(books.id, book.id))
        .returning()
    )[0];
  });
}

// Book search: our own books (with your shelf) plus Open Library results for
// discovery. Open Library being slow or down only drops the second list.
export function bookSearchRouter(openLibrary: OpenLibrary, limitPosting: RequestHandler = pass, gutenberg: Gutenberg = new Gutenberg()) {
  const search = Router();
  search.get(
    "/books/search",
    requireAuth,
    handle(async (req, res) => {
      const q = String(req.query.q ?? "").trim();
      if (q.length < 2 || q.length > 100) throw new HttpError(400, "Search for 2–100 characters.");
      const pattern = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
      const db = getDb();
      const rows = await db
        .select({ ...bookSummary, olWorkId: books.olWorkId })
        .from(books)
        .where(or(sql`${books.title} ilike ${pattern}`, sql`${books.author} ilike ${pattern}`))
        .orderBy(asc(books.title))
        .limit(10);
      const counts = await chapterCounts(rows.map((b) => b._id));
      const mine = rows.length
        ? await db.select().from(userBooks).where(and(eq(userBooks.userId, req.user!.id), inArray(userBooks.bookId, rows.map((b) => b._id))))
        : [];
      const shelfOf = new Map(mine.map((m) => [m.bookId, m.shelf]));
      const local = rows.map(({ olWorkId: _o, ...b }) => ({
        ...b,
        chapterCount: counts.get(b._id) ?? 0,
        chaptersAvailable: (counts.get(b._id) ?? 0) > 0,
        shelf: shelfOf.get(b._id) ?? null,
      }));
      let openLibraryResults: Awaited<ReturnType<OpenLibrary["search"]>> = [];
      let openLibraryError = false;
      try {
        // Leave out works we already have (by Open Library id, or by title and author).
        const ourWorks = new Set(rows.map((b) => b.olWorkId).filter(Boolean));
        const ours = new Set(local.map((b) => `${b.title}|${b.author}`.toLowerCase()));
        openLibraryResults = (await openLibrary.search(q)).filter(
          (b) => !ourWorks.has(b.key.replace("/works/", "")) && !ours.has(`${b.title}|${b.author}`.toLowerCase())
        );
      } catch {
        openLibraryError = true;
      }
      res.json({ query: q, local, openLibrary: openLibraryResults, openLibraryError });
    })
  );

  // Before the book page loads: fill in Open Library details the first time.
  search.get(
    "/books/:idOrSlug",
    requireAuth,
    (req, res, next) => {
      (async () => {
        if (req.params.idOrSlug !== "search") {
          let book = await findBook(req.params.idOrSlug);
          if (book && book.olWorkId && !book.detailsFetchedAt) book = await fillDetails(book, openLibrary);
          if (book && book.olWorkId && !book.chaptersCheckedAt) await fillChapters(book, openLibrary, gutenberg);
        }
      })().then(() => next(), next);
    }
  );

  // Set how many chapters a book has (books from Open Library start without
  // any). Numbered chapters 1..N; you need the book on your shelf. Reader-set
  // chapters can be corrected until a circle starts reading the book.
  search.post(
    "/books/:idOrSlug/chapters",
    requireAuth,
    limitPosting,
    handle(async (req, res) => {
      const book = await findBook(req.params.idOrSlug);
      if (!book) throw new HttpError(404, "Book not found.");
      const count = req.body.count;
      if (!Number.isInteger(count) || count < 1 || count > MAX_CHAPTERS) {
        throw new HttpError(400, `Enter a number of chapters from 1 to ${MAX_CHAPTERS}.`);
      }
      const db = getDb();
      const me = req.user!.id;

      const current = await db
        .select({ seq: chapters.seq, title: chapters.title })
        .from(chapters)
        .where(eq(chapters.bookId, book.id))
        .orderBy(asc(chapters.seq));
      if (current.length > 0 && !chaptersEditable(book)) {
        throw new HttpError(409, "This book's chapter list was checked by us and can't be changed.");
      }
      const lowest = current.length ? await lowestAllowedCount(book.id) : 1;
      if (count < lowest) {
        throw new HttpError(409, `A circle has a discussion about chapter ${lowest}, so this book needs at least ${lowest} chapters.`);
      }
      // Keep the titles we have (e.g. "The Cyclone"); new chapters get a number.
      const titleOf = new Map(current.map((c) => [c.seq, c.title]));
      const list = Array.from({ length: count }, (_, i) => ({ seq: i + 1, title: titleOf.get(i + 1) ?? `Chapter ${i + 1}` }));
      await db.transaction(async (tx) => {
        await replaceChapters(tx, book.id, list);
        await tx.update(books).set({ chaptersSetBy: me }).where(eq(books.id, book.id));
        // Setting up a book's chapters means you're interested: it goes on Want to read
        // if it isn't on one of your shelves yet.
        await tx.insert(userBooks).values({ userId: me, bookId: book.id, shelf: "want", chapterSeq: 0 }).onConflictDoNothing();
      });
      res.json({ chapterCount: count, chaptersSetByReader: true });
    })
  );

  // Put back Project Gutenberg's chapter list after a reader changed it.
  search.post(
    "/books/:idOrSlug/chapters/restore",
    requireAuth,
    limitPosting,
    handle(async (req, res) => {
      const book = await findBook(req.params.idOrSlug);
      if (!book) throw new HttpError(404, "Book not found.");
      const db = getDb();
      const me = req.user!.id;
      if (!book.gutenbergId) throw new HttpError(404, "This book has no chapter list from Project Gutenberg.");
      if (!book.chaptersSetBy) throw new HttpError(409, "It already uses Project Gutenberg's chapter list.");
      let list;
      try {
        list = await gutenberg.chapters(book.gutenbergId);
      } catch {
        throw new HttpError(502, "Project Gutenberg isn't answering right now. Please try again in a minute.");
      }
      if (!list) throw new HttpError(404, "Project Gutenberg's chapter list isn't available any more.");
      const lowest = await lowestAllowedCount(book.id);
      if (list.length < lowest) {
        throw new HttpError(409, `A circle has a discussion about chapter ${lowest}, but Gutenberg's list has only ${list.length} chapters.`);
      }
      await db.transaction(async (tx) => {
        await replaceChapters(tx, book.id, list!);
        await tx.update(books).set({ chaptersSetBy: null }).where(eq(books.id, book.id));
        await tx.insert(userBooks).values({ userId: me, bookId: book.id, shelf: "want", chapterSeq: 0 }).onConflictDoNothing();
      });
      res.json({ chapterCount: list.length, chaptersSetByReader: false });
    })
  );

  // Add an Open Library book to GawainBook and put it on your shelf, in one
  // step. The details come from Open Library on the server, never from the
  // request, so nobody can invent books. Already added? It's reused.
  search.post(
    "/books/import",
    requireAuth,
    limitPosting,
    handle(async (req, res) => {
      const key = String(req.body.key ?? "");
      if (!WORK_KEY.test(key)) throw new HttpError(400, "That isn't an Open Library book.");
      const shelf = req.body.shelf ?? "want";
      if (!SHELVES.includes(shelf)) throw new HttpError(400, "Shelf must be want, reading or finished.");
      const workId = key.replace("/works/", "");
      const db = getDb();

      let [book] = await db.select().from(books).where(eq(books.olWorkId, workId));
      let created = false;
      if (!book) {
        let work;
        try {
          work = await openLibrary.work(key);
        } catch {
          throw new HttpError(502, "Open Library isn't answering right now. Please try again in a minute.");
        }
        if (!work) throw new HttpError(404, "Open Library doesn't have that book.");
        const base = slugify(work.title) || "book";
        const [taken] = await db.select({ id: books.id }).from(books).where(eq(books.slug, base));
        const slug = taken ? `${base}-${workId.toLowerCase()}` : base;
        const values = {
          title: work.title,
          author: work.author,
          publishedYear: work.year && work.year > -2000 && work.year < 3000 ? work.year : null,
          coverColor: coverColorFor(work.title),
          coverUrl: work.coverUrl,
          olWorkId: workId,
          sourceNote: `Book details from Open Library (openlibrary.org${key}). Chapters aren't available yet.`,
        };
        // Two readers adding the same book at once can clash on the slug or on
        // the work id: either way, don't fail. Take the row that won, or (if
        // another book took the slug) try again with the id in the slug,
        // which is unique.
        for (const candidate of [slug, `${base}-${workId.toLowerCase()}`]) {
          const inserted = await db.insert(books).values({ slug: candidate, ...values }).onConflictDoNothing().returning();
          if (inserted.length) {
            book = inserted[0];
            created = true;
            break;
          }
          [book] = await db.select().from(books).where(eq(books.olWorkId, workId));
          if (book) break;
        }
        if (!book) throw new HttpError(409, "Someone is adding this book right now. Please try again.");
      }

      book = await fillDetails(book, openLibrary);
      book = await fillChapters(book, openLibrary, gutenberg);
      const last = (await chapterCounts([book.id])).get(book.id) ?? 0;
      const chapter = shelf === "finished" ? last : 0;
      const [row] = await db
        .insert(userBooks)
        .values({ userId: req.user!.id, bookId: book.id, shelf, chapterSeq: chapter })
        .onConflictDoUpdate({ target: [userBooks.userId, userBooks.bookId], set: { shelf, updatedAt: new Date() } })
        .returning();
      res.status(created ? 201 : 200).json({
        book: {
          _id: book.id,
          slug: book.slug,
          title: book.title,
          author: book.author,
          publishedYear: book.publishedYear,
          coverColor: book.coverColor,
          coverUrl: book.coverUrl,
          chapterCount: last,
        },
        shelf: row.shelf,
        created,
      });
    })
  );
  return search;
}

export default router;
