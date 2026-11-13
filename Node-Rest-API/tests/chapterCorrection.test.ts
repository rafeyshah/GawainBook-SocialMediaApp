import { readFileSync } from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { books, chapters } from "../src/db/schema";
import { OpenLibrary } from "../src/openLibrary";
import { Gutenberg } from "../src/gutenberg";
import { Client, CONSENT, makeApp } from "./helpers";
import { makeBook } from "./reading.helpers";

const OZ_TEXT = readFileSync(path.join(__dirname, "fixtures/gutenberg/pg55-oz.txt"), "utf8");
const OZ = { key: "/works/OL18417W", title: "The Wonderful Wizard of Oz", author_name: ["L. Frank Baum"], id_project_gutenberg: ["55"] };
const PLAIN = { key: "/works/OL5W", title: "A Modern Novel", author_name: ["Someone"] };

const ol = () =>
  new OpenLibrary({
    fetch: (async (url: string) => {
      if (!url.includes("search.json")) return { ok: true, status: 200, json: async () => ({ description: "", subjects: [] }) };
      const key = decodeURIComponent(new URL(url).searchParams.get("q") || "").match(/^key:(\/works\/OL\d+W)$/)?.[1];
      return { ok: true, status: 200, json: async () => ({ docs: [OZ, PLAIN].filter((d) => d.key === key) }) };
    }) as never,
  });

function gutenberg(state: { text?: string | Error } = { text: OZ_TEXT }) {
  const fetch = jest.fn(async () => {
    if (state.text instanceof Error) throw state.text;
    return state.text === undefined ? { ok: false, status: 404, text: async () => "" } : { ok: true, status: 200, text: async () => state.text as string };
  });
  return { gb: new Gutenberg({ fetch: fetch as never }), fetch, state };
}

let n = 0;
async function reader(g = gutenberg()) {
  const i = ++n;
  const c = await new Client(makeApp({}, ol(), g.gb)).init();
  await c.post("/api/auth/register", { username: `cor${i}x`, email: `cor${i}@example.com`, password: "secret123", ...CONSENT });
  return c;
}
const titles = async (bookId: string) =>
  (await getDb().select().from(chapters).where(eq(chapters.bookId, bookId))).sort((a, b) => a.seq - b.seq).map((c) => c.title);

describe("correcting a count you entered by mistake", () => {
  test("enter 10, realise it's 31, change it; you can do it again", async () => {
    const c = await reader(gutenberg({}));
    const { body } = await c.post("/api/books/import", { key: PLAIN.key, shelf: "reading" });
    await c.post(`/api/books/${body.book._id}/chapters`, { count: 10 });
    expect((await c.post(`/api/books/${body.book._id}/chapters`, { count: 31 })).body).toEqual({ chapterCount: 31, chaptersSetByReader: true });
    expect((await c.post(`/api/books/${body.book._id}/chapters`, { count: 30 })).body.chapterCount).toBe(30);
    expect((await c.get(`/api/books/${body.book._id}`)).body).toMatchObject({ chapterCount: 30, canSetChapters: true });
  });

  test("another reader can correct it too, with or without the book on a shelf", async () => {
    const g = gutenberg({});
    const a = await reader(g);
    const b = await reader(g);
    const outsider = await reader(g);
    const { body } = await a.post("/api/books/import", { key: PLAIN.key });
    await a.post(`/api/books/${body.book._id}/chapters`, { count: 10 });
    await b.post("/api/books/import", { key: PLAIN.key });
    expect((await b.post(`/api/books/${body.book._id}/chapters`, { count: 12 })).status).toBe(200);
    expect((await outsider.post(`/api/books/${body.book._id}/chapters`, { count: 5 })).status).toBe(200);
    expect((await outsider.get(`/api/books/${body.book._id}`)).body).toMatchObject({ shelf: "want", chapterCount: 5 });
    // The first reader's shelf is untouched.
    expect((await a.get(`/api/books/${body.book._id}`)).body.shelf).toBe("want");
  });
});

describe("correcting a Gutenberg chapter list", () => {
  test("titles are kept when the count changes; new chapters get a number", async () => {
    const c = await reader();
    const { body } = await c.post("/api/books/import", { key: OZ.key, shelf: "reading" });
    await c.post(`/api/books/${body.book._id}/chapters`, { count: 26 });
    const t = await titles(body.book._id);
    expect(t).toHaveLength(26);
    expect(t[0]).toBe("The Cyclone");
    expect(t[23]).toBe("Home Again");
    expect(t.slice(24)).toEqual(["Chapter 25", "Chapter 26"]);
    await c.post(`/api/books/${body.book._id}/chapters`, { count: 3 });
    expect(await titles(body.book._id)).toEqual(["The Cyclone", "The Council with the Munchkins", "How Dorothy Saved the Scarecrow"]);
  });

  test("after a change, Gutenberg's list can be restored, by anyone with the book", async () => {
    const g = gutenberg();
    const a = await reader(g);
    const b = await reader(g);
    const { body } = await a.post("/api/books/import", { key: OZ.key, shelf: "reading" });
    await a.post(`/api/books/${body.book._id}/chapters`, { count: 5 });
    await b.post("/api/books/import", { key: OZ.key, shelf: "want" });
    expect((await b.get(`/api/books/${body.book._id}`)).body).toMatchObject({ canRestoreChapters: true, chaptersSetByReader: true });
    expect((await b.post(`/api/books/${body.book._id}/chapters/restore`)).body).toEqual({ chapterCount: 24, chaptersSetByReader: false });
    const page = (await a.get(`/api/books/${body.book._id}`)).body;
    expect(page).toMatchObject({ chapterCount: 24, chaptersSetByReader: false, canRestoreChapters: false });
    expect(page.chapters[23].title).toBe("Home Again");
  });

  test("restore when nothing was changed → 409; without Gutenberg → 404; anyone signed in can restore", async () => {
    const g = gutenberg();
    const c = await reader(g);
    const { body: oz } = await c.post("/api/books/import", { key: OZ.key });
    expect((await c.post(`/api/books/${oz.book._id}/chapters/restore`)).status).toBe(409);
    const plainG = gutenberg({});
    const c2 = await reader(plainG);
    const { body: plain } = await c2.post("/api/books/import", { key: PLAIN.key });
    await c2.post(`/api/books/${plain.book._id}/chapters`, { count: 9 });
    expect((await c2.post(`/api/books/${plain.book._id}/chapters/restore`)).status).toBe(404);
    await c.post(`/api/books/${oz.book._id}/chapters`, { count: 3 });
    const outsider = await reader(g);
    expect((await outsider.get(`/api/books/${oz.book._id}`)).body.canRestoreChapters).toBe(true);
    expect((await outsider.post(`/api/books/${oz.book._id}/chapters/restore`)).status).toBe(200);
    expect((await outsider.get(`/api/books/${oz.book._id}`)).body).toMatchObject({ shelf: "want", chapterCount: 24 });
    expect((await c.post("/api/books/no-such-book/chapters/restore")).status).toBe(404);
  });

  test("restore when Gutenberg is down → 502 and nothing changes", async () => {
    const g = gutenberg();
    const c = await reader(g);
    const { body } = await c.post("/api/books/import", { key: OZ.key });
    await c.post(`/api/books/${body.book._id}/chapters`, { count: 5 });
    g.state.text = new Error("down");
    expect((await c.post(`/api/books/${body.book._id}/chapters/restore`)).status).toBe(502);
    expect(await titles(body.book._id)).toHaveLength(5);
  });

  test("restore can't drop below a circle's discussion", async () => {
    const g = gutenberg();
    const c = await reader(g);
    const { body } = await c.post("/api/books/import", { key: OZ.key, shelf: "reading" });
    await c.post(`/api/books/${body.book._id}/chapters`, { count: 30 });
    const { body: circle } = await c.post("/api/circles", { name: "Oz circle", bookId: body.book._id });
    await c.put(`/api/books/${body.book._id}/progress`, { chapter: 28 });
    await c.post(`/api/circles/${circle._id}/threads`, { chapter: 28, title: "Chapter 28 talk" });
    const res = await c.post(`/api/books/${body.book._id}/chapters/restore`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/only 24 chapters/);
  });
});

describe("what stays safe", () => {
  test("curated demo books can't be changed", async () => {
    const book = await makeBook(61, { slug: "curated", title: "Curated" });
    const c = await reader();
    await c.put(`/api/books/${book.id}/progress`, { shelf: "want" });
    expect((await c.get(`/api/books/${book.id}`)).body).toMatchObject({ canSetChapters: false, canRestoreChapters: false });
    const res = await c.post(`/api/books/${book.id}/chapters`, { count: 10 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/checked by us/);
  });

  test("progress past the new end is pulled back; finished readers end on the last chapter", async () => {
    const g = gutenberg({});
    const a = await reader(g);
    const b = await reader(g);
    const { body } = await a.post("/api/books/import", { key: PLAIN.key, shelf: "reading" });
    await a.post(`/api/books/${body.book._id}/chapters`, { count: 40 });
    await a.put(`/api/books/${body.book._id}/progress`, { chapter: 35 });
    await b.post("/api/books/import", { key: PLAIN.key, shelf: "finished" });
    await a.post(`/api/books/${body.book._id}/chapters`, { count: 20 });
    expect((await a.get(`/api/books/${body.book._id}`)).body.chapter).toBe(20);
    expect((await b.get(`/api/books/${body.book._id}`)).body.chapter).toBe(20);
    await a.post(`/api/books/${body.book._id}/chapters`, { count: 25 });
    expect((await b.get(`/api/books/${body.book._id}`)).body.chapter).toBe(25);
    expect((await a.get(`/api/books/${body.book._id}`)).body.chapter).toBe(20);
  });

  test("a circle with no discussions yet doesn't limit the count", async () => {
    const g = gutenberg({});
    const c = await reader(g);
    const { body } = await c.post("/api/books/import", { key: PLAIN.key, shelf: "reading" });
    await c.post(`/api/books/${body.book._id}/chapters`, { count: 10 });
    await c.post("/api/circles", { name: "Empty circle", bookId: body.book._id });
    expect((await c.get(`/api/books/${body.book._id}`)).body.minChapterCount).toBe(1);
    expect((await c.post(`/api/books/${body.book._id}/chapters`, { count: 2 })).status).toBe(200);
  });

  test("discussions in another book's circles don't count", async () => {
    const g = gutenberg({});
    const c = await reader(g);
    const other = await makeBook(40, { slug: "other-book", title: "Other" });
    await c.put(`/api/books/${other.id}/progress`, { chapter: 30 });
    const { body: oc } = await c.post("/api/circles", { name: "Other circle", bookId: other.id });
    await c.post(`/api/circles/${oc._id}/threads`, { chapter: 30, title: "Other talk" });
    const { body } = await c.post("/api/books/import", { key: PLAIN.key, shelf: "reading" });
    await c.post(`/api/books/${body.book._id}/chapters`, { count: 10 });
    await c.post("/api/circles", { name: "Mine", bookId: body.book._id });
    expect((await c.post(`/api/books/${body.book._id}/chapters`, { count: 5 })).status).toBe(200);
  });

  test("the reader who last changed it is recorded", async () => {
    const g = gutenberg({});
    const c = await reader(g);
    const me = (await c.get("/api/auth/me")).body;
    const { body } = await c.post("/api/books/import", { key: PLAIN.key });
    await c.post(`/api/books/${body.book._id}/chapters`, { count: 7 });
    const [row] = await getDb().select().from(books).where(eq(books.id, body.book._id));
    expect(row.chaptersSetBy).toBe(me._id);
  });
});
