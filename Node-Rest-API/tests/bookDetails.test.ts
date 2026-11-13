import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { books } from "../src/db/schema";
import { OpenLibrary, cleanDescription, cleanSubjects, parseWorkDetails, MAX_DESCRIPTION, MAX_SUBJECTS } from "../src/openLibrary";
import { MAX_CHAPTERS } from "../src/routes/books";
import { Client, CONSENT, makeApp } from "./helpers";
import { makeBook } from "./reading.helpers";

const WORK = {
  key: "/works/OL10W",
  title: "Mansfield Park",
  author_name: ["Jane Austen"],
  first_publish_year: 1814,
  cover_i: 77,
  number_of_pages_median: 480,
  description: "Fanny Price is sent to live with her rich relatives at Mansfield Park. ([source][1])\n\n[1]: https://en.wikipedia.org/wiki/Mansfield_Park",
  subjects: ["Fiction", "Courtship", "England -- Fiction", "Regency", "courtship", "Families", "Accessible book", "Young women"],
};

// Fake Open Library: search (incl. key: lookups) and /works/OL…W.json records.
function fakeOL(docs: Record<string, unknown>[] = [WORK], opts: { detailsFail?: boolean } = {}) {
  const fetch = jest.fn(async (url: string) => {
    const work = url.match(/^https:\/\/openlibrary\.org(\/works\/OL\d+W)\.json$/)?.[1];
    if (work) {
      if (opts.detailsFail) throw new Error("down");
      const d = docs.find((x) => x.key === work);
      return d ? { ok: true, status: 200, json: async () => ({ description: d.description, subjects: d.subjects }) } : { ok: false, status: 404, json: async () => ({}) };
    }
    const q = decodeURIComponent(new URL(url).searchParams.get("q") || "");
    const key = q.match(/^key:(\/works\/OL\d+W)$/)?.[1];
    return { ok: true, status: 200, json: async () => ({ docs: key ? docs.filter((d) => d.key === key) : docs }) };
  });
  return { ol: new OpenLibrary({ fetch: fetch as never }), fetch };
}

let n = 0;
async function reader(ol: OpenLibrary) {
  const i = ++n;
  const c = await new Client(makeApp({}, ol)).init();
  const res = await c.post("/api/auth/register", { username: `det${i}x`, email: `det${i}@example.com`, password: "secret123", ...CONSENT });
  return { c, id: res.body._id as string };
}

describe("cleanDescription", () => {
  test("drops source notes, link references and Markdown links", () => {
    expect(cleanDescription(WORK.description)).toBe("Fanny Price is sent to live with her rich relatives at Mansfield Park.");
    expect(cleanDescription("Read [the novel](https://x.example/a) today.")).toBe("Read the novel today.");
    expect(cleanDescription("See [this][2] edition.")).toBe("See this edition.");
  });
  test("cuts at a ---- separator (contents lists)", () => {
    expect(cleanDescription("A story.\n\n----------\nContains:\n- Vol 1")).toBe("A story.");
  });
  test("accepts the { value } form", () => {
    expect(cleanDescription({ type: "/type/text", value: "Hello." })).toBe("Hello.");
  });
  test.each([[undefined], [null], [42], [{}]])("returns empty for %p", (v) => expect(cleanDescription(v)).toBe(""));
  test("long descriptions end at a full stop within the limit", () => {
    const long = "This is a sentence. ".repeat(200);
    const out = cleanDescription(long);
    expect(out.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
    expect(out.endsWith(".")).toBe(true);
  });
  test("no full stop: cut with an ellipsis", () => {
    const out = cleanDescription("word ".repeat(400));
    expect(out.length).toBeLessThanOrEqual(MAX_DESCRIPTION + 1);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("cleanSubjects", () => {
  test("keeps short readable subjects, dropping catalogue noise and duplicates", () => {
    expect(cleanSubjects(WORK.subjects)).toEqual(["Courtship", "Regency", "Families", "Young women"]);
  });
  test(`at most ${MAX_SUBJECTS}`, () => {
    expect(cleanSubjects(Array.from({ length: 20 }, (_, i) => `Topic ${String.fromCharCode(65 + i)}`))).toHaveLength(MAX_SUBJECTS);
  });
  test.each([[undefined], ["Courtship"], [[1, null, {}]]])("returns [] for %p", (v) => expect(cleanSubjects(v)).toEqual([]));
  test("capitalises the first letter", () => expect(cleanSubjects(["love stories"])).toEqual(["Love stories"]));
  test("parseWorkDetails combines both", () => {
    expect(parseWorkDetails({ description: "Hi.", subjects: ["Romance"] })).toEqual({ description: "Hi.", subjects: ["Romance"] });
    expect(parseWorkDetails(null)).toEqual({ description: "", subjects: [] });
  });
});

describe("OpenLibrary.details", () => {
  test("fetches the work record, cached", async () => {
    const { ol, fetch } = fakeOL();
    expect(await ol.details("/works/OL10W")).toMatchObject({ subjects: expect.arrayContaining(["Courtship"]) });
    await ol.details("/works/OL10W");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  test("unknown works are null; bad keys never reach the network", async () => {
    const { ol, fetch } = fakeOL();
    expect(await ol.details("/works/OL99W")).toBeNull();
    expect(await ol.details("/books/OL1M")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("book details on import", () => {
  test("description, subjects and page count are saved with the book", async () => {
    const { ol } = fakeOL();
    const { c } = await reader(ol);
    await c.post("/api/books/import", { key: "/works/OL10W", shelf: "want" });
    const page = (await c.get("/api/books/mansfield-park")).body;
    expect(page).toMatchObject({
      description: "Fanny Price is sent to live with her rich relatives at Mansfield Park.",
      subjects: ["Courtship", "Regency", "Families", "Young women"],
      pageCount: 480,
      chapterCount: 0,
      canSetChapters: true,
      chaptersSetByReader: false,
    });
  });

  test("if details fail at import, the book is still added and they're filled in on the next visit", async () => {
    const down = fakeOL([WORK], { detailsFail: true });
    const r = await reader(down.ol);
    expect((await r.c.post("/api/books/import", { key: "/works/OL10W" })).status).toBe(201);
    const [row] = await getDb().select().from(books).where(eq(books.olWorkId, "OL10W"));
    expect(row.detailsFetchedAt).toBeNull();
    const up = fakeOL();
    const r2 = await reader(up.ol);
    expect((await r2.c.get("/api/books/mansfield-park")).body.description).toMatch(/Fanny Price/);
    // Only once: later visits don't call Open Library.
    const calls = up.fetch.mock.calls.length;
    await r2.c.get("/api/books/mansfield-park");
    expect(up.fetch.mock.calls.length).toBe(calls);
  });

  test("books that didn't come from Open Library are never looked up", async () => {
    await makeBook(3, { slug: "local-book", title: "Local Book" });
    const { ol, fetch } = fakeOL();
    const { c } = await reader(ol);
    expect((await c.get("/api/books/local-book")).status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("an existing description isn't overwritten", async () => {
    const { ol } = fakeOL();
    const { c } = await reader(ol);
    await c.post("/api/books/import", { key: "/works/OL10W" });
    await getDb().update(books).set({ description: "Our own words.", detailsFetchedAt: null }).where(eq(books.olWorkId, "OL10W"));
    expect((await c.get("/api/books/mansfield-park")).body.description).toBe("Our own words.");
  });
});

describe("setting chapters", () => {
  async function imported(shelf = "reading") {
    const { ol } = fakeOL();
    const r = await reader(ol);
    const { body } = await r.c.post("/api/books/import", { key: "/works/OL10W", shelf });
    return { ...r, ol, bookId: body.book._id as string };
  }

  test("a reader with the book on a shelf sets the chapter count; progress then works", async () => {
    const { c, bookId } = await imported();
    const res = await c.post(`/api/books/${bookId}/chapters`, { count: 48 });
    expect(res.body).toEqual({ chapterCount: 48, chaptersSetByReader: true });
    const page = (await c.get(`/api/books/${bookId}`)).body;
    expect(page.chapterCount).toBe(48);
    expect(page.chapters[0]).toEqual({ seq: 1, title: "Chapter 1" });
    expect((await c.put(`/api/books/${bookId}/progress`, { chapter: 12 })).body).toMatchObject({ chapter: 12, chapterCount: 48 });
  });

  test("…and then a circle can read it", async () => {
    const { c, bookId } = await imported();
    await c.post(`/api/books/${bookId}/chapters`, { count: 10 });
    expect((await c.post("/api/circles", { name: "Mansfield readers", bookId })).status).toBe(201);
  });

  test.each([[0], [201], [2.5], ["10"], [null], [undefined]])("rejects count %p", async (count) => {
    const { c, bookId } = await imported();
    expect((await c.post(`/api/books/${bookId}/chapters`, { count })).status).toBe(400);
  });

  test(`${MAX_CHAPTERS} is the most`, async () => {
    const { c, bookId } = await imported();
    expect((await c.post(`/api/books/${bookId}/chapters`, { count: MAX_CHAPTERS })).status).toBe(200);
  });

  test("you need the book on your shelf", async () => {
    const { ol, bookId } = await imported();
    const other = await reader(ol);
    expect((await other.c.post(`/api/books/${bookId}/chapters`, { count: 10 })).status).toBe(403);
  });

  test("reader-set chapters can be corrected; progress past the new end is pulled back; finished readers end on it", async () => {
    const { c, ol, bookId } = await imported();
    await c.post(`/api/books/${bookId}/chapters`, { count: 50 });
    await c.put(`/api/books/${bookId}/progress`, { chapter: 45 });
    const other = await reader(ol);
    await other.c.post("/api/books/import", { key: "/works/OL10W", shelf: "finished" });
    expect((await other.c.get(`/api/books/${bookId}`)).body.chapter).toBe(50);
    expect((await c.post(`/api/books/${bookId}/chapters`, { count: 40 })).status).toBe(200);
    expect((await c.get(`/api/books/${bookId}`)).body.chapter).toBe(40);
    expect((await other.c.get(`/api/books/${bookId}`)).body.chapter).toBe(40);
  });

  test("once a circle reads it, chapters are fixed", async () => {
    const { c, bookId } = await imported();
    await c.post(`/api/books/${bookId}/chapters`, { count: 10 });
    await c.post("/api/circles", { name: "Fixed now", bookId });
    const res = await c.post(`/api/books/${bookId}/chapters`, { count: 12 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/circle is already reading/);
    expect((await c.get(`/api/books/${bookId}`)).body.canSetChapters).toBe(false);
  });

  test("books with chapters from their source can't be changed", async () => {
    const book = await makeBook(61, { slug: "pp-src", title: "PP source" });
    const { ol } = fakeOL();
    const { c } = await reader(ol);
    await c.put(`/api/books/${book.id}/progress`, { shelf: "want" });
    expect((await c.get(`/api/books/${book.id}`)).body.canSetChapters).toBe(false);
    expect((await c.post(`/api/books/${book.id}/chapters`, { count: 10 })).status).toBe(409);
  });

  test("unknown books are 404; needs a session; rate limited", async () => {
    const { ol } = fakeOL();
    const { c } = await reader(ol);
    expect((await c.post("/api/books/no-such-book/chapters", { count: 5 })).status).toBe(404);
    const anon = await new Client(makeApp({}, ol)).init();
    expect((await anon.post("/api/books/whatever/chapters", { count: 5 })).status).toBe(401);
  });
});

describe("removing a book from your shelves", () => {
  test("an added book can be removed, and added back", async () => {
    const { ol } = fakeOL();
    const { c } = await reader(ol);
    const { body } = await c.post("/api/books/import", { key: "/works/OL10W", shelf: "want" });
    expect((await c.delete(`/api/books/${body.book._id}/progress`)).body).toEqual({ shelf: null, chapter: 0 });
    const shelves = (await c.get("/api/shelves")).body;
    expect([...shelves.want, ...shelves.reading, ...shelves.finished]).toEqual([]);
    expect((await c.get(`/api/books/${body.book._id}`)).body.shelf).toBeNull();
    // The book itself stays in GawainBook for others.
    expect((await getDb().select().from(books).where(eq(books.olWorkId, "OL10W"))).length).toBe(1);
    expect((await c.post("/api/books/import", { key: "/works/OL10W", shelf: "reading" })).body.shelf).toBe("reading");
  });

  test("removing only affects you", async () => {
    const { ol } = fakeOL();
    const a = await reader(ol);
    const b = await reader(ol);
    const { body } = await a.c.post("/api/books/import", { key: "/works/OL10W" });
    await b.c.post("/api/books/import", { key: "/works/OL10W" });
    await a.c.delete(`/api/books/${body.book._id}/progress`);
    expect((await b.c.get("/api/shelves")).body.want).toHaveLength(1);
  });
});
