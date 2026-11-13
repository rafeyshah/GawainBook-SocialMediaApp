import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { books } from "../src/db/schema";
import { COVER_PALETTE, coverColorFor, slugify } from "../src/routes/books";
import { Client, CONSENT, makeApp } from "./helpers";
import { makeBook } from "./reading.helpers";
import { MANSFIELD, OZ, OZ_TEXT, bookReader, doc, fakeGutenberg, fakeOpenLibrary, importBook } from "./books.helpers";

const rowFor = async (olWorkId: string) => (await getDb().select().from(books).where(eq(books.olWorkId, olWorkId)))[0];

describe("slugs and cover colours", () => {
  test.each([
    ["Pride and Prejudice", "pride-and-prejudice"],
    ["  Émile, ou De l'éducation!  ", "emile-ou-de-l-education"],
    ["The Lord of the Rings: The Fellowship of the Ring (50th Anniversary Edition)", "the-lord-of-the-rings-the-fellowship-of-the-ring-50th"],
    ["a ".repeat(100), "a-".repeat(29) + "a"], // ≤ 60, never ending in a dash
    ["a".repeat(100), "a".repeat(60)],
    ["!!!", ""],
    ["日本語", ""],
  ])("slugify(%p) = %p", (title, slug) => expect(slugify(title)).toBe(slug));

  test("coverColorFor is stable and from the palette", () => {
    expect(coverColorFor("Emma")).toBe(coverColorFor("Emma"));
    expect(COVER_PALETTE).toContain(coverColorFor("Anything at all"));
  });
});

describe("POST /api/books/import", () => {
  test("adds the book with Open Library's details and shelves it", async () => {
    const c = await bookReader(fakeOpenLibrary([MANSFIELD]).ol);
    const res = await c.post("/api/books/import", { key: "/works/OL10W", shelf: "reading", title: "Fake", coverUrl: "https://evil.example/x.png" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      created: true,
      shelf: "reading",
      // Details come from Open Library, never from the request.
      book: { slug: "mansfield-park", title: "Mansfield Park", author: "Jane Austen", publishedYear: 1814, coverUrl: "https://covers.openlibrary.org/b/id/77-M.jpg", chapterCount: 0 },
    });
    expect((await c.get("/api/books/mansfield-park")).body).toMatchObject({
      olWorkId: "OL10W",
      shelf: "reading",
      description: "Fanny Price is sent to live with her rich relatives at Mansfield Park.",
      subjects: ["Courtship", "Regency", "Families", "Young women"],
      pageCount: 480,
      chapters: [],
      canSetChapters: true,
      sourceNote: expect.stringMatching(/Open Library/),
    });
  });

  test("a public-domain book gets its real chapter list from Project Gutenberg, credited", async () => {
    const c = await bookReader(fakeOpenLibrary([OZ]).ol, fakeGutenberg({ 55: OZ_TEXT }).gb);
    const res = await c.post("/api/books/import", { key: OZ.key, shelf: "finished" });
    expect(res.body.book.chapterCount).toBe(24);
    const page = (await c.get(`/api/books/${res.body.book._id}`)).body;
    expect(page.chapters[0]).toEqual({ seq: 1, title: "The Cyclone" });
    expect(page).toMatchObject({ chapter: 24, gutenbergId: 55, chaptersSetByReader: false, canRestoreChapters: false, sourceNote: expect.stringMatching(/Project Gutenberg eBook #55/) });
    expect((await c.post("/api/circles", { name: "Yellow brick", bookId: res.body.book._id })).status).toBe(201);
  });

  test("without a usable Gutenberg text the book has no chapters, and circles can't read it yet", async () => {
    const plain = { ...OZ, key: "/works/OL5W", title: "A Modern Novel", id_project_gutenberg: undefined };
    const gutenberg = fakeGutenberg({ 55: "*** START OF THE PROJECT GUTENBERG EBOOK X ***\nno chapters\n*** END OF THE PROJECT GUTENBERG EBOOK X ***" });
    const c = await bookReader(fakeOpenLibrary([OZ, plain]).ol, gutenberg.gb);
    const modern = await importBook(c, plain.key, "reading");
    expect(gutenberg.fetch).not.toHaveBeenCalled(); // no Gutenberg id: not even asked
    expect((await importBook(c, OZ.key).then((id) => c.get(`/api/books/${id}`))).body.chapterCount).toBe(0); // unparseable: none made up
    const circle = await c.post("/api/circles", { name: "Too soon", bookId: modern });
    expect(circle.body.error).toMatch(/doesn't have chapters/);
    // Shelves still work; chapter progress doesn't.
    expect((await c.put(`/api/books/${modern}/progress`, { chapter: 3 })).status).toBe(400);
    expect((await c.put(`/api/books/${modern}/progress`, { shelf: "finished" })).body).toMatchObject({ shelf: "finished", chapter: 0 });
  });

  test("if Open Library details or Gutenberg fail at import, the book is added anyway and filled in on a later visit, once", async () => {
    const mansfield = { ...MANSFIELD, id_project_gutenberg: ["55"] };
    const down = await bookReader(fakeOpenLibrary([mansfield], { detailsDown: true }).ol, fakeGutenberg({ 55: new Error("down") }).gb);
    const id = await importBook(down, "/works/OL10W");
    expect(await rowFor("OL10W")).toMatchObject({ detailsFetchedAt: null, chaptersCheckedAt: null });

    const ol = fakeOpenLibrary([mansfield]);
    const gb = fakeGutenberg({ 55: OZ_TEXT });
    const later = await bookReader(ol.ol, gb.gb);
    expect((await later.get(`/api/books/${id}`)).body).toMatchObject({ description: expect.stringMatching(/Fanny Price/), chapterCount: 24 });
    const calls = [ol.fetch.mock.calls.length, gb.fetch.mock.calls.length];
    await later.get(`/api/books/${id}`);
    expect([ol.fetch.mock.calls.length, gb.fetch.mock.calls.length]).toEqual(calls);
  });

  test("what's already there is never overwritten, and our own books are never looked up", async () => {
    const ol = fakeOpenLibrary([MANSFIELD]);
    const gb = fakeGutenberg({ 55: OZ_TEXT });
    const c = await bookReader(ol.ol, gb.gb);
    const id = await importBook(c, "/works/OL10W");
    await c.post(`/api/books/${id}/chapters`, { count: 10 });
    await getDb().update(books).set({ description: "Our own words.", detailsFetchedAt: null, chaptersCheckedAt: null, gutenbergId: 55 }).where(eq(books.id, id));
    expect((await c.get(`/api/books/${id}`)).body).toMatchObject({ description: "Our own words.", chapterCount: 10 });

    await makeBook(3, { slug: "local-book" });
    ol.fetch.mockClear();
    gb.fetch.mockClear();
    expect((await c.get("/api/books/local-book")).status).toBe(200);
    expect(ol.fetch).not.toHaveBeenCalled();
    expect(gb.fetch).not.toHaveBeenCalled();
  });

  test("one book per work: later readers reuse it without asking Open Library again, each with their own shelf", async () => {
    const { ol, fetch } = fakeOpenLibrary([doc(1)]);
    const a = await bookReader(ol);
    const b = await bookReader(ol);
    const first = await a.post("/api/books/import", { key: "/works/OL1W" });
    expect(first.body.shelf).toBe("want"); // the default
    const second = await b.post("/api/books/import", { key: "/works/OL1W", shelf: "finished" });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ created: false, shelf: "finished", book: { _id: first.body.book._id } });
    expect(fetch).toHaveBeenCalledTimes(2); // search + details, for the first reader only
    // Adding again moves it between your shelves.
    await a.post("/api/books/import", { key: "/works/OL1W", shelf: "reading" });
    expect((await a.get("/api/shelves")).body).toMatchObject({ want: [], reading: [expect.objectContaining({ _id: first.body.book._id })] });
  });

  test("five readers adding the same new book at once all succeed, sharing one row", async () => {
    const { ol } = fakeOpenLibrary([doc(8)]);
    const readers = await Promise.all([1, 2, 3, 4, 5].map(() => bookReader(ol)));
    const results = await Promise.all(readers.map((r) => r.post("/api/books/import", { key: "/works/OL8W" })));
    expect(results.map((r) => r.body.error ?? "ok")).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(new Set(results.map((r) => r.body.book._id)).size).toBe(1);
    expect(results.filter((r) => r.body.created)).toHaveLength(1);
  });

  test.each([
    ["a title another book already has", { title: "Emma" }, { slug: "emma-ol3w" }],
    ["a title without letters", { title: "!!!" }, { slug: "book" }],
    ["no cover", { cover_i: undefined }, { coverUrl: null, coverColor: expect.any(String) }],
    ["no or nonsense publish year", { first_publish_year: 99999 }, { publishedYear: null }],
  ])("%s", async (_case, extra, expected) => {
    await makeBook(5, { slug: "emma", title: "Emma" });
    const c = await bookReader(fakeOpenLibrary([doc(3, extra)]).ol);
    expect((await c.post("/api/books/import", { key: "/works/OL3W" })).body.book).toMatchObject(expected);
  });

  test.each([
    ["no key", {}],
    ["an edition key", { key: "/books/OL1M" }],
    ["a path trick", { key: "/works/OL1W/../../x" }],
    ["a URL", { key: "https://openlibrary.org/works/OL1W" }],
    ["a bad shelf", { key: "/works/OL1W", shelf: "favourites" }],
  ])("rejects %s with 400, without calling Open Library", async (_n, body) => {
    const { ol, fetch } = fakeOpenLibrary([doc(1)]);
    expect((await (await bookReader(ol)).post("/api/books/import", body)).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("a work Open Library doesn't have is 404; Open Library down is 502, but books we have still work", async () => {
    const c = await bookReader(fakeOpenLibrary([doc(1)]).ol);
    await importBook(c, "/works/OL1W");
    expect((await c.post("/api/books/import", { key: "/works/OL99W" })).status).toBe(404);
    const offline = await bookReader(fakeOpenLibrary([], { down: true }).ol);
    expect((await offline.post("/api/books/import", { key: "/works/OL2W" })).status).toBe(502);
    expect((await offline.post("/api/books/import", { key: "/works/OL1W", shelf: "reading" })).status).toBe(200);
  });

  test("is rate limited per reader", async () => {
    const c = await new Client(makeApp({ posting: { windowMs: 60_000, max: 2 } }, fakeOpenLibrary([doc(1), doc(2), doc(3)]).ol)).init();
    await c.post("/api/auth/register", { username: "importer", email: "importer@example.com", password: "secret123", ...CONSENT });
    for (const n of [1, 2]) await c.post("/api/books/import", { key: `/works/OL${n}W` });
    expect((await c.post("/api/books/import", { key: "/works/OL3W" })).status).toBe(429);
  });

  test("the database itself refuses covers from anywhere but Open Library, and non-work ids", async () => {
    await expect(getDb().insert(books).values({ slug: "x-cover", title: "X", author: "Y", coverUrl: "https://evil.example/c.jpg" })).rejects.toThrow();
    await expect(getDb().insert(books).values({ slug: "x-id", title: "X", author: "Y", olWorkId: "OL1M" })).rejects.toThrow();
  });
});

describe("after adding", () => {
  test("search shows it as ours, with your shelf, and no longer as an Open Library result", async () => {
    const c = await bookReader(fakeOpenLibrary([doc(1, { title: "Mansfield Park" })]).ol);
    expect((await c.get("/api/books/search", { q: "mansfield" })).body.local).toEqual([]);
    await importBook(c, "/works/OL1W");
    const res = await c.get("/api/books/search", { q: "mansfield" });
    expect(res.body.local).toEqual([expect.objectContaining({ title: "Mansfield Park", shelf: "want", chaptersAvailable: false, coverUrl: expect.stringMatching(/covers\.openlibrary/) })]);
    expect(res.body.openLibrary).toEqual([]);
  });

  test("removing it only takes it off your shelves: the book stays for others, and can be added back", async () => {
    const { ol } = fakeOpenLibrary([doc(1)]);
    const a = await bookReader(ol);
    const b = await bookReader(ol);
    const id = await importBook(a, "/works/OL1W");
    await importBook(b, "/works/OL1W");
    expect((await a.delete(`/api/books/${id}/progress`)).body).toEqual({ shelf: null, chapter: 0 });
    expect((await a.get("/api/shelves")).body).toEqual({ want: [], reading: [], finished: [] });
    expect((await b.get("/api/shelves")).body.want).toHaveLength(1);
    expect((await a.post("/api/books/import", { key: "/works/OL1W", shelf: "reading" })).body.shelf).toBe("reading");
  });
});
