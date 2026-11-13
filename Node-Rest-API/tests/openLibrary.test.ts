import { OpenLibrary, parseResults, OPEN_LIBRARY_COVERS } from "../src/openLibrary";
import { Client, makeApp, signUp } from "./helpers";
import { makeBook } from "./reading.helpers";

const doc = (n: number, extra: Record<string, unknown> = {}) => ({
  key: `/works/OL${n}W`,
  title: `Title ${n}`,
  author_name: ["Jane Austen"],
  first_publish_year: 1813,
  cover_i: 1000 + n,
  edition_count: 42,
  ...extra,
});

const okFetch = (docs: unknown[]) => {
  const fn = jest.fn(async (_url: string, _init: unknown) => ({ ok: true, status: 200, json: async () => ({ docs }) }));
  return fn;
};

describe("parseResults", () => {
  test("maps fields and builds cover URLs", () => {
    expect(parseResults({ docs: [doc(1)] })).toEqual([
      { key: "/works/OL1W", title: "Title 1", author: "Jane Austen", year: 1813, coverUrl: `${OPEN_LIBRARY_COVERS}/b/id/1001-M.jpg`, editions: 42, pages: null, gutenbergIds: [] },
    ]);
  });
  test("handles missing optional fields", () => {
    expect(parseResults({ docs: [{ key: "/works/OL2W", title: "Bare" }] })[0]).toEqual({
      key: "/works/OL2W", title: "Bare", author: "Unknown author", year: null, coverUrl: null, editions: 0, pages: null, gutenbergIds: [],
    });
  });
  test("joins at most two authors and ignores non-text authors", () => {
    expect(parseResults({ docs: [doc(3, { author_name: ["A", 5, "B", "C"] })] })[0].author).toBe("A, B");
  });
  test.each([
    ["no key", { title: "x" }],
    ["a non-work key", { key: "/books/OL1M", title: "x" }],
    ["a key with a path", { key: "/works/OL1W/../../x", title: "x" }],
    ["no title", { key: "/works/OL1W" }],
    ["null", null],
  ])("drops a doc with %s", (_n, d) => expect(parseResults({ docs: [d] })).toEqual([]));
  test("drops odd cover ids and caps long titles", () => {
    const [r] = parseResults({ docs: [doc(4, { cover_i: -1, title: "t".repeat(500) })] });
    expect(r.coverUrl).toBeNull();
    expect(r.title).toHaveLength(200);
  });
  test.each([[null], [{}], [{ docs: "nope" }], ["text"]])("returns [] for %p", (data) => expect(parseResults(data)).toEqual([]));
});

describe("OpenLibrary client", () => {
  test("calls the search API with an encoded, normalised query, a limit and an identifying User-Agent", async () => {
    const fetch = okFetch([doc(1)]);
    const ol = new OpenLibrary({ fetch });
    await ol.search("  Pride   &  Prejudice ");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toMatch(/^https:\/\/openlibrary\.org\/search\.json\?q=pride%20%26%20prejudice&limit=10&fields=/);
    expect(init.headers["User-Agent"]).toMatch(/GawainBook/);
  });

  test("caches by normalised query until the TTL passes", async () => {
    let now = 0;
    const fetch = okFetch([doc(1)]);
    const ol = new OpenLibrary({ fetch, ttlMs: 1000, now: () => now });
    await ol.search("Emma");
    await ol.search("  emma ");
    expect(fetch).toHaveBeenCalledTimes(1);
    now = 999;
    await ol.search("EMMA");
    expect(fetch).toHaveBeenCalledTimes(1);
    now = 1000;
    await ol.search("emma");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("drops the least recently used entry when full", async () => {
    const fetch = okFetch([]);
    const ol = new OpenLibrary({ fetch, maxEntries: 2 });
    await ol.search("a1");
    await ol.search("b1");
    await ol.search("a1"); // a1 is now most recent
    await ol.search("c1"); // evicts b1
    expect(fetch).toHaveBeenCalledTimes(3);
    await ol.search("a1");
    expect(fetch).toHaveBeenCalledTimes(3);
    await ol.search("b1");
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  test("errors and non-OK responses throw and aren't cached", async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ docs: [doc(9)] }) });
    const ol = new OpenLibrary({ fetch });
    await expect(ol.search("x1")).rejects.toThrow(/503/);
    await expect(ol.search("x1")).rejects.toThrow(/network/);
    expect(await ol.search("x1")).toHaveLength(1);
  });

  test("gives up after the timeout", async () => {
    const fetch = jest.fn((_u: string, init: { signal: AbortSignal }) =>
      new Promise<never>((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))))
    );
    const ol = new OpenLibrary({ fetch: fetch as never, timeoutMs: 20 });
    await expect(ol.search("slow")).rejects.toThrow(/aborted/);
  });
});

describe("GET /api/books/search", () => {
  const clientFor = async (ol: OpenLibrary) => {
    const c = await new Client(makeApp({}, ol)).init();
    const n = Math.random().toString(36).slice(2, 8);
    await c.post("/api/auth/register", { username: `bs${n}`, email: `bs${n}@example.com`, password: "secret123", acceptTerms: true, confirmAge: true });
    return c;
  };

  test("returns our books (chapters available) and Open Library results, minus duplicates", async () => {
    await makeBook(61, { title: "Pride and Prejudice", author: "Jane Austen", slug: "pp" });
    const ol = new OpenLibrary({ fetch: okFetch([doc(1, { title: "Pride and Prejudice" }), doc(2, { title: "Pride and Prejudice and Zombies", author_name: ["Seth Grahame-Smith"] })]) });
    const c = await clientFor(ol);
    const res = await c.get("/api/books/search", { q: "pride" });
    expect(res.status).toBe(200);
    expect(res.body.local).toEqual([expect.objectContaining({ title: "Pride and Prejudice", chapterCount: 61, chaptersAvailable: true })]);
    expect(res.body.openLibrary.map((b: { title: string }) => b.title)).toEqual(["Pride and Prejudice and Zombies"]);
    expect(res.body.openLibraryError).toBe(false);
  });

  test("matches our books by author too, and treats wildcards literally", async () => {
    await makeBook(3, { title: "Persuasion", author: "Jane Austen", slug: "pers" });
    const c = await clientFor(new OpenLibrary({ fetch: okFetch([]) }));
    expect((await c.get("/api/books/search", { q: "austen" })).body.local).toHaveLength(1);
    expect((await c.get("/api/books/search", { q: "%%" })).body.local).toEqual([]);
  });

  test("still answers with our books when Open Library is down", async () => {
    await makeBook(3, { title: "Emma", author: "Jane Austen", slug: "emma" });
    const c = await clientFor(new OpenLibrary({ fetch: jest.fn().mockRejectedValue(new Error("down")) }));
    const res = await c.get("/api/books/search", { q: "emma" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ openLibrary: [], openLibraryError: true });
    expect(res.body.local).toHaveLength(1);
  });

  test.each([["too short", "a"], ["too long", "x".repeat(101)], ["missing", undefined]])("rejects a %s query", async (_n, q) => {
    const c = await clientFor(new OpenLibrary({ fetch: okFetch([]) }));
    expect((await c.get("/api/books/search", q === undefined ? undefined : { q })).status).toBe(400);
  });

  test("needs a signed-in reader", async () => {
    const anon = await new Client().init();
    expect((await anon.get("/api/books/search", { q: "emma" })).status).toBe(401);
  });

  test("the /books/:slug route still works next to /books/search", async () => {
    const { client } = await signUp();
    await makeBook(2, { slug: "search-not" });
    expect((await client.get("/api/books/search-not")).status).toBe(200);
  });
});
