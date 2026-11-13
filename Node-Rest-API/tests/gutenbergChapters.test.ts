import { readFileSync } from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { books } from "../src/db/schema";
import { OpenLibrary, parseResults } from "../src/openLibrary";
import { Gutenberg, gutenbergTextUrl, MAX_TEXT_BYTES } from "../src/gutenberg";
import { Client, CONSENT, makeApp } from "./helpers";

const OZ_TEXT = readFileSync(path.join(__dirname, "fixtures/gutenberg/pg55-oz.txt"), "utf8");
const ALICE_TEXT = readFileSync(path.join(__dirname, "fixtures/gutenberg/pg11-alice.txt"), "utf8");

const OZ = { key: "/works/OL18417W", title: "The Wonderful Wizard of Oz", author_name: ["L. Frank Baum"], first_publish_year: 1900, id_project_gutenberg: ["55"] };

function fakeOL(docs: Record<string, unknown>[] = [OZ]) {
  return new OpenLibrary({
    fetch: (async (url: string) => {
      if (/\.json$/.test(new URL(url).pathname) && !url.includes("search.json")) return { ok: true, status: 200, json: async () => ({ description: "", subjects: [] }) };
      const q = decodeURIComponent(new URL(url).searchParams.get("q") || "");
      const key = q.match(/^key:(\/works\/OL\d+W)$/)?.[1];
      return { ok: true, status: 200, json: async () => ({ docs: key ? docs.filter((d) => d.key === key) : docs }) };
    }) as never,
  });
}

// texts: eBook id → text, or an Error to throw, or a number for an HTTP status.
function fakeGutenberg(texts: Record<number, string | Error | number>) {
  const fetch = jest.fn(async (url: string) => {
    const id = Number(url.match(/pg(\d+)\.txt$/)?.[1]);
    const t = texts[id];
    if (t instanceof Error) throw t;
    if (typeof t === "number") return { ok: false, status: t, text: async () => "" };
    if (t === undefined) return { ok: false, status: 404, text: async () => "" };
    return { ok: true, status: 200, text: async () => t };
  });
  return { gb: new Gutenberg({ fetch: fetch as never }), fetch };
}

let n = 0;
async function reader(ol: OpenLibrary, gb: Gutenberg) {
  const i = ++n;
  const c = await new Client(makeApp({}, ol, gb)).init();
  await c.post("/api/auth/register", { username: `gut${i}x`, email: `gut${i}@example.com`, password: "secret123", ...CONSENT });
  return c;
}

describe("Open Library's Gutenberg ids", () => {
  test("are parsed from search results (numbers only, at most 5)", () => {
    const [r] = parseResults({ docs: [{ key: "/works/OL1W", title: "T", id_project_gutenberg: ["1342", "x", "42671", "-3", "45186", "1", "2", "3"] }] });
    expect(r.gutenbergIds).toEqual([1342, 42671, 45186, 1, 2]);
  });
  test("missing → []", () => {
    expect(parseResults({ docs: [{ key: "/works/OL1W", title: "T" }] })[0].gutenbergIds).toEqual([]);
  });
});

describe("Gutenberg client", () => {
  test("builds the plain-text URL and reads the chapter list", async () => {
    const { gb, fetch } = fakeGutenberg({ 55: OZ_TEXT });
    const list = await gb.chapters(55);
    expect(list).toHaveLength(24);
    expect(fetch.mock.calls[0][0]).toBe(gutenbergTextUrl(55));
    expect(gutenbergTextUrl(55)).toBe("https://www.gutenberg.org/cache/epub/55/pg55.txt");
  });
  test.each([[0], [-1], [1.5], [1_000_000]])("refuses id %p without a request", async (id) => {
    const { gb, fetch } = fakeGutenberg({});
    expect(await gb.chapters(id)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  test("404 → null; other errors throw", async () => {
    const { gb } = fakeGutenberg({ 2: 503, 3: new Error("down") });
    expect(await gb.chapters(1)).toBeNull();
    await expect(gb.chapters(2)).rejects.toThrow(/503/);
    await expect(gb.chapters(3)).rejects.toThrow(/down/);
  });
  test("texts over the size limit are skipped", async () => {
    const { gb } = fakeGutenberg({ 9: "x".repeat(MAX_TEXT_BYTES + 1) });
    expect(await gb.chapters(9)).toBeNull();
  });
  test("firstChapters tries ids in turn and returns the first with chapters", async () => {
    const { gb, fetch } = fakeGutenberg({ 2: "not a gutenberg text", 11: ALICE_TEXT, 55: OZ_TEXT });
    const found = await gb.firstChapters([1, 2, 11, 55]);
    expect(found?.id).toBe(11);
    expect(found?.chapters).toHaveLength(12);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  test("firstChapters tries at most 3", async () => {
    const { gb, fetch } = fakeGutenberg({ 99: OZ_TEXT });
    expect(await gb.firstChapters([1, 2, 3, 99])).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

describe("adding a public-domain book gives it its real chapters", () => {
  test("Oz from Open Library: 24 titled chapters, progress works, the source is credited", async () => {
    const { gb } = fakeGutenberg({ 55: OZ_TEXT });
    const c = await reader(fakeOL(), gb);
    const { body } = await c.post("/api/books/import", { key: OZ.key, shelf: "reading" });
    expect(body.book.chapterCount).toBe(24);
    const page = (await c.get(`/api/books/${body.book.slug}`)).body;
    expect(page.chapters[0]).toEqual({ seq: 1, title: "The Cyclone" });
    expect(page.chapters[23]).toEqual({ seq: 24, title: "Home Again" });
    expect(page.sourceNote).toMatch(/Project Gutenberg eBook #55/);
    // From Gutenberg, but still correctable by a reader with it on a shelf.
    expect(page).toMatchObject({ chaptersSetByReader: false, canSetChapters: true, canRestoreChapters: false, gutenbergId: 55 });
    expect((await c.put(`/api/books/${body.book._id}/progress`, { chapter: 9 })).body).toMatchObject({ chapter: 9, chapterCount: 24 });
    // A circle can read it straight away.
    expect((await c.post("/api/circles", { name: "Yellow brick", bookId: body.book._id })).status).toBe(201);
  });

  test("finished on import: progress set to the last chapter", async () => {
    const { gb } = fakeGutenberg({ 55: OZ_TEXT });
    const c = await reader(fakeOL(), gb);
    expect((await c.post("/api/books/import", { key: OZ.key, shelf: "finished" })).body.book.chapterCount).toBe(24);
    const shelves = (await c.get("/api/shelves")).body;
    expect(shelves.finished[0]).toMatchObject({ chapter: 24, chapterCount: 24 });
  });

  test("Gutenberg is only asked once per book", async () => {
    const { gb, fetch } = fakeGutenberg({ 55: OZ_TEXT });
    const ol = fakeOL();
    const a = await reader(ol, gb);
    const b = await reader(ol, gb);
    await a.post("/api/books/import", { key: OZ.key });
    await b.post("/api/books/import", { key: OZ.key });
    await a.get("/api/books/the-wonderful-wizard-of-oz");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("no Gutenberg id (books still in copyright): no chapters, readers can set the count", async () => {
    const { gb, fetch } = fakeGutenberg({});
    const c = await reader(fakeOL([{ ...OZ, key: "/works/OL5W", title: "A Modern Novel", id_project_gutenberg: undefined }]), gb);
    const { body } = await c.post("/api/books/import", { key: "/works/OL5W", shelf: "want" });
    expect(body.book.chapterCount).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect((await c.get(`/api/books/${body.book.slug}`)).body.canSetChapters).toBe(true);
  });

  test("a Gutenberg text without reliable chapters: none are made up", async () => {
    const { gb } = fakeGutenberg({ 55: "*** START OF THE PROJECT GUTENBERG EBOOK X ***\nno chapters here\n*** END OF THE PROJECT GUTENBERG EBOOK X ***" });
    const c = await reader(fakeOL(), gb);
    expect((await c.post("/api/books/import", { key: OZ.key })).body.book.chapterCount).toBe(0);
  });

  test("Gutenberg down at import: the book is added anyway, and chapters arrive on a later visit", async () => {
    const down = fakeGutenberg({ 55: new Error("down") });
    const ol = fakeOL();
    const c = await reader(ol, down.gb);
    const { body } = await c.post("/api/books/import", { key: OZ.key });
    expect(body.book.chapterCount).toBe(0);
    const [row] = await getDb().select().from(books).where(eq(books.olWorkId, "OL18417W"));
    expect(row.chaptersCheckedAt).toBeNull();
    const up = fakeGutenberg({ 55: OZ_TEXT });
    const c2 = await reader(ol, up.gb);
    expect((await c2.get(`/api/books/${body.book.slug}`)).body.chapterCount).toBe(24);
  });

  test("books added before this existed get their chapters the first time their page is opened", async () => {
    const { gb } = fakeGutenberg({});
    const ol = fakeOL();
    const c = await reader(ol, gb); // Gutenberg has nothing: like the old behaviour
    const { body } = await c.post("/api/books/import", { key: OZ.key, shelf: "reading" });
    await getDb().update(books).set({ chaptersCheckedAt: null }).where(eq(books.id, body.book._id));
    const later = fakeGutenberg({ 55: OZ_TEXT });
    const c2 = await reader(ol, later.gb);
    expect((await c2.get(`/api/books/${body.book.slug}`)).body.chapters[0].title).toBe("The Cyclone");
  });

  test("chapters a reader already set are never replaced", async () => {
    const { gb } = fakeGutenberg({});
    const ol = fakeOL();
    const c = await reader(ol, gb);
    const { body } = await c.post("/api/books/import", { key: OZ.key, shelf: "reading" });
    await c.post(`/api/books/${body.book._id}/chapters`, { count: 10 });
    await getDb().update(books).set({ chaptersCheckedAt: null }).where(eq(books.id, body.book._id));
    const later = fakeGutenberg({ 55: OZ_TEXT });
    const c2 = await reader(ol, later.gb);
    const page = (await c2.get(`/api/books/${body.book.slug}`)).body;
    expect(page.chapterCount).toBe(10);
    expect(later.fetch).not.toHaveBeenCalled();
  });

  test("books not from Open Library are never looked up", async () => {
    const { gb, fetch } = fakeGutenberg({ 55: OZ_TEXT });
    const c = await reader(fakeOL(), gb);
    await c.get("/api/books/pride-and-prejudice");
    expect(fetch).not.toHaveBeenCalled();
  });
});
