import { signUp, newClient } from "./helpers";
import { makeBook, setProgress } from "./reading.helpers";

describe("GET /api/books", () => {
  test("lists books with chapter counts and your shelf", async () => {
    const a = await signUp();
    const book = await makeBook(5, { title: "Alpha" });
    await setProgress(a, book.id, 2);
    const res = await a.client.get("/api/books");
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ _id: book.id, title: "Alpha", chapterCount: 5, shelf: "reading", chapter: 2 });
  });

  test("requires sign-in", async () => {
    expect((await (await newClient()).get("/api/books")).status).toBe(401);
  });
});

describe("GET /api/books/:idOrSlug", () => {
  test("by id or slug: details, ordered chapters and your progress", async () => {
    const a = await signUp();
    const book = await makeBook(3);
    for (const key of [book.id, book.slug]) {
      const res = await a.client.get(`/api/books/${key}`);
      expect(res.status).toBe(200);
      expect(res.body.chapters.map((c: { seq: number }) => c.seq)).toEqual([1, 2, 3]);
      expect(res.body).toMatchObject({ chapterCount: 3, shelf: null, chapter: 0 });
    }
  });

  test("lists public circles and private circles only for members", async () => {
    const owner = await signUp();
    const other = await signUp();
    const book = await makeBook(3);
    await owner.client.post("/api/circles", { name: "Open Circle", bookId: book.id });
    await owner.client.post("/api/circles", { name: "Secret Circle", bookId: book.id, visibility: "private" });
    const names = async (who: typeof owner) =>
      (await who.client.get(`/api/books/${book.id}`)).body.circles.map((c: { name: string }) => c.name);
    expect(await names(owner)).toEqual(["Open Circle", "Secret Circle"]);
    expect(await names(other)).toEqual(["Open Circle"]);
  });

  test.each(["no-such-book", "64b000000000000000000000"])("unknown %p is 404", async (key) => {
    const a = await signUp();
    expect((await a.client.get(`/api/books/${key}`)).status).toBe(404);
  });
});

describe("PUT /api/books/:id/progress", () => {
  test("records the chapter and keeps the book on 'reading'", async () => {
    const a = await signUp();
    const book = await makeBook(10);
    expect((await setProgress(a, book.id, 4)).body).toEqual({ shelf: "reading", chapter: 4, chapterCount: 10 });
  });

  test("reaching the last chapter moves the book to 'finished'", async () => {
    const a = await signUp();
    const book = await makeBook(10);
    expect((await setProgress(a, book.id, 10)).body.shelf).toBe("finished");
  });

  test("marking as finished sets progress to the last chapter", async () => {
    const a = await signUp();
    const book = await makeBook(10);
    const res = await a.client.put(`/api/books/${book.id}/progress`, { shelf: "finished" });
    expect(res.body).toMatchObject({ shelf: "finished", chapter: 10 });
  });

  test("'want to read' starts at chapter 0", async () => {
    const a = await signUp();
    const book = await makeBook(10);
    expect((await a.client.put(`/api/books/${book.id}/progress`, { shelf: "want" })).body).toMatchObject({ shelf: "want", chapter: 0 });
  });

  test("progress can move backwards (e.g. a re-read)", async () => {
    const a = await signUp();
    const book = await makeBook(10);
    await setProgress(a, book.id, 8);
    expect((await setProgress(a, book.id, 2)).body.chapter).toBe(2);
  });

  test.each([
    ["a chapter past the end", { chapter: 11 }],
    ["a negative chapter", { chapter: -1 }],
    ["a fractional chapter", { chapter: 2.5 }],
    ["a chapter as text", { chapter: "3" }],
    ["an unknown shelf", { shelf: "favourites" }],
  ])("rejects %s", async (_name, body) => {
    const a = await signUp();
    const book = await makeBook(10);
    expect((await a.client.put(`/api/books/${book.id}/progress`, body)).status).toBe(400);
  });

  test("only ever changes your own progress", async () => {
    const a = await signUp();
    const b = await signUp();
    const book = await makeBook(10);
    await setProgress(b, book.id, 1);
    await a.client.put(`/api/books/${book.id}/progress`, { chapter: 9, userId: b.user._id });
    expect((await b.client.get(`/api/books/${book.id}`)).body.chapter).toBe(1);
    expect((await a.client.get(`/api/books/${book.id}`)).body.chapter).toBe(9);
  });

  test("DELETE removes the book from your shelves", async () => {
    const a = await signUp();
    const book = await makeBook(3);
    await setProgress(a, book.id, 1);
    await a.client.delete(`/api/books/${book.id}/progress`);
    expect((await a.client.get(`/api/books/${book.id}`)).body).toMatchObject({ shelf: null, chapter: 0 });
  });
});

describe("GET /api/shelves", () => {
  test("groups your books by shelf, with your progress", async () => {
    const a = await signUp();
    const [b1, b2, b3] = [await makeBook(5), await makeBook(5), await makeBook(5)];
    await setProgress(a, b1.id, 2);
    await a.client.put(`/api/books/${b2.id}/progress`, { shelf: "want" });
    await a.client.put(`/api/books/${b3.id}/progress`, { shelf: "finished" });
    const res = await a.client.get("/api/shelves");
    expect(res.body.reading.map((b: { _id: string }) => b._id)).toEqual([b1.id]);
    expect(res.body.reading[0]).toMatchObject({ chapter: 2, chapterCount: 5 });
    expect(res.body.want.map((b: { _id: string }) => b._id)).toEqual([b2.id]);
    expect(res.body.finished.map((b: { _id: string }) => b._id)).toEqual([b3.id]);
  });

  test("another reader's shelves show books but never their chapter", async () => {
    const a = await signUp({ username: "shelfowner" });
    const b = await signUp();
    const book = await makeBook(5);
    await setProgress(a, book.id, 3);
    const res = await b.client.get("/api/shelves", { username: "shelfowner" });
    expect(res.body.reading).toHaveLength(1);
    expect(res.body.reading[0]).not.toHaveProperty("chapter");
  });

  test("unknown reader is 404", async () => {
    const a = await signUp();
    expect((await a.client.get("/api/shelves", { username: "ghost" })).status).toBe(404);
  });
});
