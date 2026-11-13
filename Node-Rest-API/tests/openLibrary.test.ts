import { OpenLibrary, parseResults, cleanDescription, cleanSubjects, parseWorkDetails, OPEN_LIBRARY_COVERS, MAX_DESCRIPTION, MAX_SUBJECTS } from "../src/openLibrary";
import { makeBook } from "./reading.helpers";
import { MANSFIELD, bookReader, doc, fakeOpenLibrary } from "./books.helpers";

const okFetch = (docs: unknown[]) => jest.fn(async (_url: string, _init?: unknown) => ({ ok: true, status: 200, json: async () => ({ docs }) }));

describe("parseResults", () => {
  test("maps a search doc, building the cover URL and keeping numeric Gutenberg ids (at most 5)", () => {
    const d = doc(1, { author_name: ["Jane Austen"], first_publish_year: 1813, edition_count: 42, number_of_pages_median: 300, id_project_gutenberg: ["1342", "x", "-3", "45186", "1", "2", "3"] });
    expect(parseResults({ docs: [d] })).toEqual([
      { key: "/works/OL1W", title: "Book 1", author: "Jane Austen", year: 1813, coverUrl: `${OPEN_LIBRARY_COVERS}/b/id/501-M.jpg`, editions: 42, pages: 300, gutenbergIds: [1342, 45186, 1, 2, 3] },
    ]);
  });

  test("fills in missing fields, joins at most two text authors, drops odd covers and caps titles", () => {
    expect(parseResults({ docs: [{ key: "/works/OL2W", title: "Bare" }] })[0]).toEqual({
      key: "/works/OL2W", title: "Bare", author: "Unknown author", year: null, coverUrl: null, editions: 0, pages: null, gutenbergIds: [],
    });
    const [r] = parseResults({ docs: [doc(3, { author_name: ["A", 5, "B", "C"], cover_i: -1, title: "t".repeat(500) })] });
    expect(r).toMatchObject({ author: "A, B", coverUrl: null });
    expect(r.title).toHaveLength(200);
  });

  test.each([
    ["no key", { docs: [{ title: "x" }] }],
    ["an edition key", { docs: [{ key: "/books/OL1M", title: "x" }] }],
    ["a key with a path", { docs: [{ key: "/works/OL1W/../../x", title: "x" }] }],
    ["no title", { docs: [{ key: "/works/OL1W" }] }],
    ["a null doc", { docs: [null] }],
    ["no docs", {}],
    ["docs that aren't a list", { docs: "nope" }],
    ["not an object", "text"],
  ])("ignores %s", (_name, data) => expect(parseResults(data)).toEqual([]));
});

describe("work details", () => {
  test.each([
    [MANSFIELD.description, "Fanny Price is sent to live with her rich relatives at Mansfield Park."],
    ["Read [the novel](https://x.example/a) today. See [this][2] edition.", "Read the novel today. See this edition."],
    ["A story.\n\n----------\nContains:\n- Vol 1", "A story."],
    [{ type: "/type/text", value: "Hello." }, "Hello."],
    [undefined, ""],
    [42, ""],
    [{}, ""],
  ])("cleanDescription(%p) = %p", (raw, out) => expect(cleanDescription(raw)).toBe(out));

  test("long descriptions end at a sentence within the limit, or with an ellipsis if there's none", () => {
    const sentences = cleanDescription("This is a sentence. ".repeat(200));
    expect(sentences.endsWith(".")).toBe(true);
    expect(sentences.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
    const noStop = cleanDescription("word ".repeat(400));
    expect(noStop.endsWith("…")).toBe(true);
    expect(noStop.length).toBeLessThanOrEqual(MAX_DESCRIPTION + 1);
  });

  test.each([
    [MANSFIELD.subjects, ["Courtship", "Regency", "Families", "Young women"]], // catalogue noise and repeats dropped
    [["love stories"], ["Love stories"]],
    [undefined, []],
    ["Courtship", []],
    [[1, null, {}], []],
  ])("cleanSubjects(%p) = %p", (raw, out) => expect(cleanSubjects(raw)).toEqual(out));

  test(`cleanSubjects keeps at most ${MAX_SUBJECTS}; parseWorkDetails combines both`, () => {
    expect(cleanSubjects(Array.from({ length: 20 }, (_, i) => `Topic ${String.fromCharCode(65 + i)}`))).toHaveLength(MAX_SUBJECTS);
    expect(parseWorkDetails({ description: "Hi.", subjects: ["Romance"] })).toEqual({ description: "Hi.", subjects: ["Romance"] });
    expect(parseWorkDetails(null)).toEqual({ description: "", subjects: [] });
  });
});

describe("OpenLibrary client", () => {
  test("searches with an encoded, normalised query, a limit and an identifying User-Agent", async () => {
    const fetch = okFetch([doc(1)]);
    await new OpenLibrary({ fetch }).search("  Pride   &  Prejudice ");
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
    now = 999;
    await ol.search("EMMA");
    expect(fetch).toHaveBeenCalledTimes(1);
    now = 1000;
    await ol.search("emma");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("evicts the least recently used entry when full", async () => {
    const fetch = okFetch([]);
    const ol = new OpenLibrary({ fetch, maxEntries: 2 });
    for (const q of ["a1", "b1", "a1", "c1", "a1"]) await ol.search(q); // c1 evicts b1, not a1
    expect(fetch).toHaveBeenCalledTimes(3);
    await ol.search("b1");
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  test("errors, non-OK responses and timeouts throw and aren't cached", async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ docs: [doc(9)] }) });
    const ol = new OpenLibrary({ fetch });
    await expect(ol.search("x1")).rejects.toThrow(/503/);
    await expect(ol.search("x1")).rejects.toThrow(/network/);
    expect(await ol.search("x1")).toHaveLength(1);

    const hang = jest.fn((_u: string, init: { signal: AbortSignal }) => new Promise<never>((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")))));
    await expect(new OpenLibrary({ fetch: hang as never, timeoutMs: 20 }).search("slow")).rejects.toThrow(/aborted/);
  });

  test("work() looks a work up by its exact, case-sensitive key; anything else never reaches the network", async () => {
    const { ol, fetch } = fakeOpenLibrary([doc(66534), doc(2)]);
    expect(await ol.work("/works/OL66534W")).toMatchObject({ key: "/works/OL66534W" });
    expect(decodeURIComponent(fetch.mock.calls[0][0])).toContain("q=key:/works/OL66534W");
    expect(OpenLibrary.normalise("key:/works/OL1W")).toBe("key:/works/OL1W"); // not lowercased, unlike searches
    expect(await ol.work("/works/OL9W")).toBeNull();
    for (const bad of ["/books/OL1M", "../etc"]) expect(await ol.work(bad)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("details() reads the work record once (cached); unknown works are null; bad keys never reach the network", async () => {
    const { ol, fetch } = fakeOpenLibrary([MANSFIELD]);
    expect(await ol.details("/works/OL10W")).toMatchObject({ subjects: expect.arrayContaining(["Courtship"]) });
    await ol.details("/works/OL10W");
    expect(await ol.details("/works/OL99W")).toBeNull();
    expect(await ol.details("/books/OL1M")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("GET /api/books/search", () => {
  test("returns our books (ready for circles) and Open Library's, without duplicates", async () => {
    await makeBook(61, { title: "Pride and Prejudice", author: "Jane Austen", slug: "pp" });
    const c = await bookReader(new OpenLibrary({ fetch: okFetch([doc(1, { title: "Pride and Prejudice", author_name: ["Jane Austen"] }), doc(2, { title: "Pride and Prejudice and Zombies" })]) }));
    const res = await c.get("/api/books/search", { q: "pride" });
    expect(res.body.local).toEqual([expect.objectContaining({ title: "Pride and Prejudice", chapterCount: 61, chaptersAvailable: true, shelf: null })]);
    expect(res.body.openLibrary.map((b: { title: string }) => b.title)).toEqual(["Pride and Prejudice and Zombies"]);
    expect(res.body.openLibraryError).toBe(false);
  });

  test("matches our books by author too, and treats wildcards literally", async () => {
    await makeBook(3, { title: "Persuasion", author: "Jane Austen", slug: "pers" });
    const c = await bookReader();
    expect((await c.get("/api/books/search", { q: "austen" })).body.local).toHaveLength(1);
    expect((await c.get("/api/books/search", { q: "%%" })).body.local).toEqual([]);
  });

  test("still answers with our books when Open Library is down", async () => {
    await makeBook(3, { title: "Emma", author: "Jane Austen", slug: "emma" });
    const c = await bookReader(fakeOpenLibrary([], { down: true }).ol);
    const res = await c.get("/api/books/search", { q: "emma" });
    expect(res.body).toMatchObject({ openLibrary: [], openLibraryError: true, local: [expect.objectContaining({ title: "Emma" })] });
  });

  test.each([["too short", { q: "a" }], ["too long", { q: "x".repeat(101) }], ["missing", undefined]])("rejects a %s query", async (_n, query) => {
    const c = await bookReader();
    expect((await c.get("/api/books/search", query)).status).toBe(400);
  });
});
