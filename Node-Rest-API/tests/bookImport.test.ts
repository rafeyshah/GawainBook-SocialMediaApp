import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { books } from "../src/db/schema";
import { OpenLibrary } from "../src/openLibrary";
import { COVER_PALETTE, coverColorFor, slugify } from "../src/routes/books";
import { Client, CONSENT, makeApp } from "./helpers";
import { makeBook } from "./reading.helpers";

const doc = (n: number, extra: Record<string, unknown> = {}) => ({
  key: `/works/OL${n}W`,
  title: `Book ${n}`,
  author_name: ["Some Author"],
  first_publish_year: 1900 + n,
  cover_i: 500 + n,
  edition_count: 3,
  ...extra,
});

// A fake Open Library that knows these works; counts calls.
function fakeOpenLibrary(docs: Record<string, unknown>[], opts: { fail?: boolean } = {}) {
  const fetch = jest.fn(async (url: string) => {
    if (opts.fail) throw new Error("down");
    // A work's own record: /works/OL…W.json (description and subjects).
    const work = url.match(/^https:\/\/openlibrary\.org(\/works\/OL\d+W)\.json$/)?.[1];
    if (work) {
      const d = docs.find((x) => x.key === work);
      return d
        ? { ok: true, status: 200, json: async () => ({ description: d.description ?? "", subjects: d.subjects ?? [] }) }
        : { ok: false, status: 404, json: async () => ({}) };
    }
    const q = decodeURIComponent(new URL(url).searchParams.get("q") || "");
    const key = q.match(/^key:(\/works\/OL\d+W)$/)?.[1];
    return { ok: true, status: 200, json: async () => ({ docs: key ? docs.filter((d) => d.key === key) : docs }) };
  });
  return { ol: new OpenLibrary({ fetch }), fetch };
}

let n = 0;
async function reader(ol: OpenLibrary) {
  const i = ++n; // captured before any await, so parallel readers don't collide
  const c = await new Client(makeApp({}, ol)).init();
  const res = await c.post("/api/auth/register", { username: `imp${i}x`, email: `imp${i}@example.com`, password: "secret123", ...CONSENT });
  return { c, id: res.body._id as string };
}

describe("helpers", () => {
  test.each([
    ["Pride and Prejudice", "pride-and-prejudice"],
    ["  Émile, ou De l'éducation!  ", "emile-ou-de-l-education"],
    ["The Lord of the Rings: The Fellowship of the Ring (50th Anniversary Edition)", "the-lord-of-the-rings-the-fellowship-of-the-ring-50th"],
    ["!!!", ""],
    ["日本語", ""],
  ])("slugify(%p) = %p", (title, slug) => expect(slugify(title)).toBe(slug));

  test("a single very long word is still cut to 60", () => {
    expect(slugify("a".repeat(100))).toHaveLength(60);
  });

  test("slugs never end with a dash and are at most 60 characters", () => {
    const s = slugify("a ".repeat(100));
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("-")).toBe(false);
  });

  test("coverColorFor is stable and from the palette", () => {
    expect(coverColorFor("Emma")).toBe(coverColorFor("Emma"));
    expect(COVER_PALETTE).toContain(coverColorFor("Anything at all"));
  });
});

describe("OpenLibrary.work", () => {
  test("asks Open Library with the id's exact case (ids are case-sensitive)", async () => {
    const { ol, fetch } = fakeOpenLibrary([doc(66534)]);
    expect(await ol.work("/works/OL66534W")).toMatchObject({ key: "/works/OL66534W" });
    const url = decodeURIComponent((fetch.mock.calls[0] as unknown as [string])[0]);
    expect(url).toContain("q=key:/works/OL66534W");
  });

  test("normal searches are still case-insensitive for the cache", () => {
    expect(OpenLibrary.normalise("  Pride  AND Prejudice ")).toBe("pride and prejudice");
    expect(OpenLibrary.normalise("key:/works/OL1W")).toBe("key:/works/OL1W");
  });

  test("finds one work by key, and rejects keys that aren't works", async () => {
    const { ol, fetch } = fakeOpenLibrary([doc(1), doc(2)]);
    expect(await ol.work("/works/OL2W")).toMatchObject({ key: "/works/OL2W", title: "Book 2" });
    expect(await ol.work("/works/OL9W")).toBeNull();
    expect(await ol.work("/books/OL1M")).toBeNull();
    expect(await ol.work("../etc")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/books/import", () => {
  test("adds the book from Open Library's details and shelves it", async () => {
    const { ol } = fakeOpenLibrary([doc(1, { title: "Northanger Abbey", author_name: ["Jane Austen"], first_publish_year: 1817 })]);
    const { c } = await reader(ol);
    const res = await c.post("/api/books/import", { key: "/works/OL1W", shelf: "reading" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      created: true,
      shelf: "reading",
      book: { slug: "northanger-abbey", title: "Northanger Abbey", author: "Jane Austen", publishedYear: 1817, coverUrl: "https://covers.openlibrary.org/b/id/501-M.jpg", chapterCount: 0 },
    });
    const shelves = (await c.get("/api/shelves")).body;
    expect(shelves.reading.map((b: { title: string }) => b.title)).toEqual(["Northanger Abbey"]);
    const page = (await c.get("/api/books/northanger-abbey")).body;
    expect(page).toMatchObject({ olWorkId: "OL1W", chapterCount: 0, shelf: "reading", chapters: [] });
    expect(page.sourceNote).toMatch(/Open Library/);
  });

  test("defaults to 'Want to read'", async () => {
    const { ol } = fakeOpenLibrary([doc(1)]);
    const { c } = await reader(ol);
    expect((await c.post("/api/books/import", { key: "/works/OL1W" })).body.shelf).toBe("want");
  });

  test("the details come from Open Library, never from the request", async () => {
    const { ol } = fakeOpenLibrary([doc(1, { title: "Real Title" })]);
    const { c } = await reader(ol);
    const res = await c.post("/api/books/import", { key: "/works/OL1W", title: "Fake Title", author: "Me", coverUrl: "https://evil.example/x.png" });
    expect(res.body.book).toMatchObject({ title: "Real Title", author: "Some Author" });
    expect(res.body.book.coverUrl).toMatch(/^https:\/\/covers\.openlibrary\.org\//);
  });

  test("a second reader gets the same book (no duplicate), with their own shelf", async () => {
    const { ol, fetch } = fakeOpenLibrary([doc(1)]);
    const a = await reader(ol);
    const b = await reader(ol);
    const first = await a.c.post("/api/books/import", { key: "/works/OL1W", shelf: "want" });
    const second = await b.c.post("/api/books/import", { key: "/works/OL1W", shelf: "finished" });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ created: false, shelf: "finished" });
    expect(second.body.book._id).toBe(first.body.book._id);
    // Looked up once (search + details) for the first reader; the second reuses it.
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await getDb().select().from(books).where(eq(books.olWorkId, "OL1W"))).length).toBe(1);
    expect((await a.c.get("/api/shelves")).body.want).toHaveLength(1);
  });

  test("adding again moves it to the new shelf", async () => {
    const { ol } = fakeOpenLibrary([doc(1)]);
    const { c } = await reader(ol);
    await c.post("/api/books/import", { key: "/works/OL1W", shelf: "want" });
    await c.post("/api/books/import", { key: "/works/OL1W", shelf: "reading" });
    const shelves = (await c.get("/api/shelves")).body;
    expect(shelves.want).toHaveLength(0);
    expect(shelves.reading).toHaveLength(1);
  });

  test("two readers adding the same new book at once create one row", async () => {
    const { ol } = fakeOpenLibrary([doc(7)]);
    const a = await reader(ol);
    const b = await reader(ol);
    const [r1, r2] = await Promise.all([a.c.post("/api/books/import", { key: "/works/OL7W" }), b.c.post("/api/books/import", { key: "/works/OL7W" })]);
    expect([r1.status, r2.status].every((s) => s === 200 || s === 201)).toBe(true);
    expect(r1.body.book._id).toBe(r2.body.book._id);
    expect((await getDb().select().from(books).where(eq(books.olWorkId, "OL7W"))).length).toBe(1);
  });

  test("five readers adding the same new book at once all succeed, with one row", async () => {
    const { ol } = fakeOpenLibrary([doc(8)]);
    const readers = await Promise.all([1, 2, 3, 4, 5].map(() => reader(ol)));
    const results = await Promise.all(readers.map((r) => r.c.post("/api/books/import", { key: "/works/OL8W" })));
    expect(results.map((r) => [r.status, r.body.error ?? "ok"])).toEqual(results.map(() => [expect.any(Number), "ok"]));
    expect(new Set(results.map((r) => r.body.book._id)).size).toBe(1);
    expect(results.filter((r) => r.body.created)).toHaveLength(1);
  });

  test("a title that clashes with an existing book gets a distinct slug", async () => {
    await makeBook(5, { slug: "emma", title: "Emma" });
    const { ol } = fakeOpenLibrary([doc(3, { title: "Emma" })]);
    const { c } = await reader(ol);
    expect((await c.post("/api/books/import", { key: "/works/OL3W" })).body.book.slug).toBe("emma-ol3w");
  });

  test("a title with no letters gets a fallback slug", async () => {
    const { ol } = fakeOpenLibrary([doc(4, { title: "!!!" })]);
    const { c } = await reader(ol);
    expect((await c.post("/api/books/import", { key: "/works/OL4W" })).body.book.slug).toBe("book");
  });

  test("no cover: falls back to a typeset cover colour", async () => {
    const { ol } = fakeOpenLibrary([doc(5, { cover_i: undefined })]);
    const { c } = await reader(ol);
    const { book } = (await c.post("/api/books/import", { key: "/works/OL5W" })).body;
    expect(book.coverUrl).toBeNull();
    expect(COVER_PALETTE).toContain(book.coverColor);
  });

  test.each([
    ["no key", {}],
    ["an edition key", { key: "/books/OL1M" }],
    ["a path trick", { key: "/works/OL1W/../../x" }],
    ["a URL", { key: "https://openlibrary.org/works/OL1W" }],
    ["a bad shelf", { key: "/works/OL1W", shelf: "favourites" }],
  ])("rejects %s with 400", async (_n, body) => {
    const { ol, fetch } = fakeOpenLibrary([doc(1)]);
    const { c } = await reader(ol);
    expect((await c.post("/api/books/import", body)).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("a work Open Library doesn't have is 404", async () => {
    const { ol } = fakeOpenLibrary([]);
    const { c } = await reader(ol);
    expect((await c.post("/api/books/import", { key: "/works/OL99W" })).status).toBe(404);
  });

  test("Open Library down: 502 for a new book, but books we already have still work", async () => {
    const up = fakeOpenLibrary([doc(1)]);
    const { c } = await reader(up.ol);
    await c.post("/api/books/import", { key: "/works/OL1W" });
    const down = fakeOpenLibrary([], { fail: true });
    const r = await reader(down.ol);
    expect((await r.c.post("/api/books/import", { key: "/works/OL2W" })).status).toBe(502);
    expect((await r.c.post("/api/books/import", { key: "/works/OL1W", shelf: "reading" })).status).toBe(200);
  });

  test("needs a session", async () => {
    const { ol } = fakeOpenLibrary([doc(1)]);
    const anon = await new Client(makeApp({}, ol)).init();
    expect((await anon.post("/api/books/import", { key: "/works/OL1W" })).status).toBe(401);
  });

  test("is rate limited per reader", async () => {
    const { ol } = fakeOpenLibrary([doc(1), doc(2), doc(3)]);
    const c = await new Client(makeApp({ posting: { windowMs: 60_000, max: 2 } }, ol)).init();
    await c.post("/api/auth/register", { username: "importer", email: "importer@example.com", password: "secret123", ...CONSENT });
    await c.post("/api/books/import", { key: "/works/OL1W" });
    await c.post("/api/books/import", { key: "/works/OL2W" });
    expect((await c.post("/api/books/import", { key: "/works/OL3W" })).status).toBe(429);
  });
});

describe("search after adding", () => {
  test("added books show up as ours, with your shelf, and drop out of the Open Library list", async () => {
    const { ol } = fakeOpenLibrary([doc(1, { title: "Mansfield Park", author_name: ["Jane Austen"] })]);
    const { c } = await reader(ol);
    let res = await c.get("/api/books/search", { q: "mansfield" });
    expect(res.body.local).toEqual([]);
    await c.post("/api/books/import", { key: "/works/OL1W", shelf: "want" });
    res = await c.get("/api/books/search", { q: "mansfield" });
    expect(res.body.local).toEqual([expect.objectContaining({ title: "Mansfield Park", shelf: "want", chaptersAvailable: false, coverUrl: expect.stringMatching(/covers\.openlibrary/) })]);
    expect(res.body.openLibrary).toEqual([]);
  });

  test("our books show your shelf (null when not shelved)", async () => {
    await makeBook(3, { slug: "persuasion", title: "Persuasion" });
    const { ol } = fakeOpenLibrary([]);
    const { c } = await reader(ol);
    expect((await c.get("/api/books/search", { q: "persuasion" })).body.local[0].shelf).toBeNull();
  });
});

describe("books without chapters", () => {
  test("can't be read by a circle", async () => {
    const { ol } = fakeOpenLibrary([doc(1)]);
    const { c } = await reader(ol);
    const { body } = await c.post("/api/books/import", { key: "/works/OL1W", shelf: "reading" });
    const res = await c.post("/api/circles", { name: "My Circle", bookId: body.book._id });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/doesn't have chapters/);
  });

  test("shelves work; chapter progress beyond 0 is refused; finishing works", async () => {
    const { ol } = fakeOpenLibrary([doc(1)]);
    const { c } = await reader(ol);
    const { body } = await c.post("/api/books/import", { key: "/works/OL1W", shelf: "reading" });
    expect((await c.put(`/api/books/${body.book._id}/progress`, { chapter: 3 })).status).toBe(400);
    expect((await c.put(`/api/books/${body.book._id}/progress`, { shelf: "finished" })).body).toMatchObject({ shelf: "finished", chapter: 0 });
    expect((await c.delete(`/api/books/${body.book._id}/progress`)).body).toEqual({ shelf: null, chapter: 0 });
  });

  test("the database refuses covers from anywhere but Open Library", async () => {
    await expect(
      getDb().insert(books).values({ slug: "x-cover", title: "X", author: "Y", coverUrl: "https://evil.example/c.jpg" })
    ).rejects.toThrow();
    await expect(getDb().insert(books).values({ slug: "x-id", title: "X", author: "Y", olWorkId: "OL1M" })).rejects.toThrow();
  });
});
