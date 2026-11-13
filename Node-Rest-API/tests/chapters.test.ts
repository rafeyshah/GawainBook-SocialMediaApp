// Readers setting, correcting and restoring a book's chapter list.
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { books, chapters } from "../src/db/schema";
import { MAX_CHAPTERS } from "../src/routes/books";
import { makeBook, makeCircle, makeThread } from "./reading.helpers";
import { OZ, OZ_TEXT, BookReader, bookReader, doc, fakeGutenberg, fakeOpenLibrary, importBook } from "./books.helpers";

const PLAIN = doc(5, { title: "A Modern Novel" }); // no Gutenberg text: readers set its chapters

// Readers sharing one Open Library + Gutenberg; `gutenberg.texts` can be changed mid-test.
function world() {
  const { ol } = fakeOpenLibrary([OZ, PLAIN]);
  const gutenberg = fakeGutenberg({ 55: OZ_TEXT });
  return { gutenberg, reader: () => bookReader(ol, gutenberg.gb) };
}
const page = async (r: BookReader, id: string) => (await r.get(`/api/books/${id}`)).body;
const setCount = (r: BookReader, id: string, count: unknown) => r.post(`/api/books/${id}/chapters`, { count });
const titles = async (id: string) => (await getDb().select().from(chapters).where(eq(chapters.bookId, id))).sort((a, b) => a.seq - b.seq).map((c) => c.title);

describe("setting the chapter count", () => {
  test("turns on progress and circles, and records who set it", async () => {
    const c = await world().reader();
    const id = await importBook(c, PLAIN.key, "reading");
    expect((await setCount(c, id, 48)).body).toEqual({ chapterCount: 48, chaptersSetByReader: true });
    expect((await page(c, id)).chapters[0]).toEqual({ seq: 1, title: "Chapter 1" });
    expect((await c.put(`/api/books/${id}/progress`, { chapter: 12 })).body).toMatchObject({ chapter: 12, chapterCount: 48 });
    expect((await c.post("/api/circles", { name: "Readers", bookId: id })).status).toBe(201);
    expect((await getDb().select().from(books).where(eq(books.id, id)))[0].chaptersSetBy).toBe(c.userId);
  });

  test.each([
    [1, 200],
    [MAX_CHAPTERS, 200],
    [0, 400],
    [MAX_CHAPTERS + 1, 400],
    [2.5, 400],
    ["10", 400],
    [null, 400],
  ])("count %p → %p", async (count, status) => {
    const c = await world().reader();
    expect((await setCount(c, await importBook(c, PLAIN.key), count)).status).toBe(status);
  });

  test("any signed-in reader can set or correct it; it goes on their Want to read shelf unless it's already on one", async () => {
    const w = world();
    const [first, finished, outsider] = [await w.reader(), await w.reader(), await w.reader()];
    const id = await importBook(first, PLAIN.key, "reading");
    await importBook(finished, PLAIN.key, "finished");
    await setCount(first, id, 10);
    await setCount(finished, id, 31); // "I counted wrong"
    expect(await page(outsider, id)).toMatchObject({ shelf: null, canSetChapters: true });
    expect((await setCount(outsider, id, 30)).status).toBe(200);
    expect(await page(outsider, id)).toMatchObject({ shelf: "want", chapterCount: 30 });
    expect((await page(first, id)).shelf).toBe("reading");
    expect(await page(finished, id)).toMatchObject({ shelf: "finished", chapter: 30 });
  });

  test("a change keeps the titles it can and numbers new chapters", async () => {
    const c = await world().reader();
    const id = await importBook(c, OZ.key);
    await setCount(c, id, 26);
    const t = await titles(id);
    expect([t[0], t[23], t[24], t[25]]).toEqual(["The Cyclone", "Home Again", "Chapter 25", "Chapter 26"]);
    await setCount(c, id, 3);
    expect(await titles(id)).toEqual(["The Cyclone", "The Council with the Munchkins", "How Dorothy Saved the Scarecrow"]);
  });

  test("progress past the new end is pulled back; finished readers end on the last chapter", async () => {
    const w = world();
    const [a, b] = [await w.reader(), await w.reader()];
    const id = await importBook(a, PLAIN.key, "reading");
    await setCount(a, id, 40);
    await a.put(`/api/books/${id}/progress`, { chapter: 35 });
    await importBook(b, PLAIN.key, "finished");
    await setCount(a, id, 20);
    expect([(await page(a, id)).chapter, (await page(b, id)).chapter]).toEqual([20, 20]);
    await setCount(a, id, 25);
    expect([(await page(a, id)).chapter, (await page(b, id)).chapter]).toEqual([20, 25]);
  });
});

describe("restoring Project Gutenberg's list", () => {
  test("after a change, anyone signed in can put Gutenberg's list back", async () => {
    const w = world();
    const [a, outsider] = [await w.reader(), await w.reader()];
    const id = await importBook(a, OZ.key, "reading");
    expect((await page(a, id)).canRestoreChapters).toBe(false); // nothing to restore yet
    await setCount(a, id, 5);
    expect(await page(outsider, id)).toMatchObject({ canRestoreChapters: true, chaptersSetByReader: true });
    expect((await outsider.post(`/api/books/${id}/chapters/restore`)).body).toEqual({ chapterCount: 24, chaptersSetByReader: false });
    expect(await page(a, id)).toMatchObject({ chapterCount: 24, chaptersSetByReader: false, canRestoreChapters: false });
    expect((await page(outsider, id)).shelf).toBe("want");
    expect(await titles(id)).toHaveLength(24);
  });

  test("refused when there's nothing to restore (409), no Gutenberg text (404), or Gutenberg is down (502, nothing changes)", async () => {
    const w = world();
    const r = await w.reader();
    const oz = await importBook(r, OZ.key);
    expect((await r.post(`/api/books/${oz}/chapters/restore`)).status).toBe(409);
    const plain = await importBook(r, PLAIN.key);
    await setCount(r, plain, 9);
    expect((await r.post(`/api/books/${plain}/chapters/restore`)).status).toBe(404);
    await setCount(r, oz, 5);
    w.gutenberg.texts[55] = new Error("down");
    expect((await r.post(`/api/books/${oz}/chapters/restore`)).status).toBe(502);
    expect(await titles(oz)).toHaveLength(5);
  });
});

describe("what stays safe", () => {
  test("never below a chapter a circle is discussing (for changes and restores); other books' circles and empty circles don't count", async () => {
    const c = await world().reader();
    const other = await makeBook(40, { slug: "other-book" });
    await c.put(`/api/books/${other.id}/progress`, { chapter: 30 });
    await makeThread({ client: c }, (await makeCircle({ client: c }, other.id))._id, 30);

    const id = await importBook(c, OZ.key, "reading");
    await setCount(c, id, 30);
    const circle = await makeCircle({ client: c }, id);
    expect((await page(c, id)).minChapterCount).toBe(1); // a circle with no discussions yet
    await c.put(`/api/books/${id}/progress`, { chapter: 28 });
    await makeThread({ client: c }, circle._id, 28);
    expect((await page(c, id)).minChapterCount).toBe(28);

    const tooFew = await setCount(c, id, 27);
    expect(tooFew.status).toBe(409);
    expect(tooFew.body.error).toMatch(/discussion about chapter 28/);
    const restore = await c.post(`/api/books/${id}/chapters/restore`); // Gutenberg has 24
    expect(restore.status).toBe(409);
    expect(restore.body.error).toMatch(/only 24 chapters/);
    expect((await setCount(c, id, 28)).status).toBe(200);
    expect((await setCount(c, id, 35)).status).toBe(200);
  });

  test("lists we checked ourselves are locked; unknown books are 404", async () => {
    const curated = await makeBook(61, { slug: "curated" });
    const c = await world().reader();
    expect(await page(c, curated.id)).toMatchObject({ canSetChapters: false, canRestoreChapters: false });
    const res = await setCount(c, curated.id, 10);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/checked by us/);
    expect((await setCount(c, "no-such-book", 5)).status).toBe(404);
    expect((await c.post("/api/books/no-such-book/chapters/restore")).status).toBe(404);
  });
});
