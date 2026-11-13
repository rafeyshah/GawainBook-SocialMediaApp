import { readFileSync } from "fs";
import path from "path";
import { chapterList, cleanTitle, headingNumber, MIN_CHAPTERS, MAX_CHAPTERS } from "../src/corpus/chapterList";
import { gutenbergTextUrl, MAX_TEXT_BYTES } from "../src/gutenberg";
import { ALICE_TEXT, OZ_TEXT, fakeGutenberg } from "./books.helpers";

// A synthetic Gutenberg book: licence header, start marker, `lines`, end marker.
const book = (...lines: string[]) => ["Licence header", "*** START OF THE PROJECT GUTENBERG EBOOK TEST ***", ...lines, "*** END OF THE PROJECT GUTENBERG EBOOK TEST ***", "Licence footer"].join("\n");
// A chapter's worth of prose, comfortably over the "real text" threshold.
const prose = (n = 3) => Array.from({ length: n }, () => "It was a quiet morning and the house was still, and nobody\nhad yet come down to breakfast.").join("\n\n");
// "", heading, "", [title, ""], prose: one chapter.
const ch = (heading: string, title?: string) => ["", heading, "", ...(title ? [title, ""] : []), prose()];
const titles = (text: string) => chapterList(text)?.map((c) => c.title) ?? null;

describe("chapter headings and titles", () => {
  test.each([["12", 12], ["XII", 12], ["iv", 4], ["XLIX", 49], ["CXXXV", 135], ["the first", 1], ["THE TWELFTH", 12], ["three", 3], ["foo", NaN]])(
    "headingNumber(%p) = %p",
    (raw, n) => expect(headingNumber(raw)).toBe(n)
  );

  test.each([
    [". The Cyclone.", "The Cyclone"],
    ["  —  A Caucus-Race and a Long Tale  ", "A Caucus-Race and a Long Tale"],
    ["_The Mail_", "The Mail"],
    ["THE PERIOD", "The Period"], // shouting capitals → title case
    ["JONATHAN HARKER’S JOURNAL--continued", "Jonathan Harker’s Journal — Continued"],
    ["", ""],
  ])("cleanTitle(%p) = %p", (raw, out) => expect(cleanTitle(raw)).toBe(out));

  test("very long titles are cut with an ellipsis", () => {
    const t = cleanTitle("A ".repeat(80));
    expect(t.length).toBeLessThanOrEqual(101);
    expect(t.endsWith("…")).toBe(true);
  });
});

describe("chapterList on real Gutenberg books", () => {
  test("Alice: 12 titled chapters; the table of contents is ignored", () => {
    const list = chapterList(ALICE_TEXT)!;
    expect(list).toHaveLength(12);
    expect(list[0]).toEqual({ seq: 1, title: "Down the Rabbit-Hole" });
    expect(list[11]).toEqual({ seq: 12, title: "Alice’s Evidence" });
  });

  test("Oz: 24 chapters, titles on the line below the heading, the short last chapter kept", () => {
    const list = chapterList(OZ_TEXT)!;
    expect(list.map((c) => c.seq)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    expect(list[0].title).toBe("The Cyclone");
    expect(list[23].title).toBe("Home Again");
  });

  test("Pride and Prejudice (illustrated edition): all 61, numbered, as the source has no titles", () => {
    const list = chapterList(readFileSync(path.join(__dirname, "../../docs/corpus/pride-and-prejudice/pg1342.txt"), "utf8"))!;
    expect(list).toHaveLength(61);
    expect(list.every((c, i) => c.seq === i + 1 && c.title === `Chapter ${i + 1}`)).toBe(true);
  });
});

describe("chapterList on the shapes books come in", () => {
  test.each([
    ["arabic and roman numbers; titles on or below the heading", book(...ch("CHAPTER 1. Loomings."), ...ch("CHAPTER II", "The Carpet-Bag"), ...ch("Chapter III: The Spouter-Inn")), ["Loomings", "The Carpet-Bag", "The Spouter-Inn"]],
    ["'CHAPTER THE FIRST' style", book(...ch("CHAPTER THE FIRST"), ...ch("CHAPTER THE SECOND"), ...ch("CHAPTER THE THIRD")), ["Chapter 1", "Chapter 2", "Chapter 3"]],
    ["letters before chapters (Frankenstein)", book(...ch("Letter 1"), ...ch("Letter 2"), ...ch("Chapter 1"), ...ch("Chapter 2")), ["Letter 1", "Letter 2", "Chapter 3", "Chapter 4"]],
    ["numbering restarting in each volume", book("VOLUME 1", ...ch("CHAPTER I"), ...ch("CHAPTER II"), "VOLUME 2", ...ch("CHAPTER I"), ...ch("CHAPTER II")), ["Chapter 1", "Chapter 2", "Chapter 3", "Chapter 4"]],
    [
      "a table of contents, including its last line before the preface",
      book("Contents", "", "CHAPTER I. One", "CHAPTER II. Two", "CHAPTER III. Three", "", "PREFACE", "", prose(), ...ch("CHAPTER I", "One"), ...ch("CHAPTER II", "Two"), ...ch("CHAPTER III", "Three")),
      ["One", "Two", "Three"],
    ],
    ["'chapter' inside prose", book(...ch("CHAPTER I"), "chapter two of my life began that day, and", prose(), ...ch("CHAPTER II"), ...ch("CHAPTER III")), ["Chapter 1", "Chapter 2", "Chapter 3"]],
    ["a prose line right after a heading (not a title)", book("", "CHAPTER I", "", "It is a truth universally acknowledged, that a single man in possession", "of a good fortune must be in want of a wife.", "", prose(), ...ch("CHAPTER II"), ...ch("CHAPTER III")), ["Chapter 1", "Chapter 2", "Chapter 3"]],
    ["a gap in the numbering (the list stops there)", book(...ch("CHAPTER I"), ...ch("CHAPTER II"), ...ch("CHAPTER III"), ...ch("CHAPTER V")), ["Chapter 1", "Chapter 2", "Chapter 3"]],
    ["Windows line endings", book(...ch("CHAPTER I"), ...ch("CHAPTER II"), ...ch("CHAPTER III")).replace(/\n/g, "\r\n"), ["Chapter 1", "Chapter 2", "Chapter 3"]],
  ])("%s", (_shape, text, expected) => expect(titles(text)).toEqual(expected));

  // No list is better than a wrong one.
  test.each([
    [`fewer than ${MIN_CHAPTERS} chapters`, book(...ch("CHAPTER I"), ...ch("CHAPTER II"))],
    [`more than ${MAX_CHAPTERS} chapters`, book(...Array.from({ length: MAX_CHAPTERS + 1 }, (_, i) => ["", `CHAPTER ${i + 1}`, "", prose(1)]).flat())],
    ["stories without chapter headings", book("", "I. A SCANDAL IN BOHEMIA", "", prose(), "", "II. THE RED-HEADED LEAGUE", "", prose())],
    ["text without Gutenberg's markers", "just some text\nCHAPTER I\n" + prose()],
  ])("%s → null", (_why, text) => expect(chapterList(text)).toBeNull());
});

describe("Gutenberg client", () => {
  test("fetches the plain-text eBook and returns its chapters", async () => {
    const { gb, fetch } = fakeGutenberg({ 55: OZ_TEXT });
    expect(await gb.chapters(55)).toHaveLength(24);
    expect(fetch).toHaveBeenCalledWith(gutenbergTextUrl(55), expect.anything());
    expect(gutenbergTextUrl(55)).toBe("https://www.gutenberg.org/cache/epub/55/pg55.txt");
  });

  test("bad ids never reach the network; missing or oversized texts are null; other failures throw", async () => {
    const { gb, fetch } = fakeGutenberg({ 2: 503, 3: new Error("down"), 9: "x".repeat(MAX_TEXT_BYTES + 1) });
    for (const id of [0, -1, 1.5, 1_000_000]) expect(await gb.chapters(id)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(await gb.chapters(1)).toBeNull();
    expect(await gb.chapters(9)).toBeNull();
    await expect(gb.chapters(2)).rejects.toThrow(/503/);
    await expect(gb.chapters(3)).rejects.toThrow(/down/);
  });

  test("firstChapters tries up to 3 ids in turn and returns the first with chapters", async () => {
    const { gb, fetch } = fakeGutenberg({ 2: "not a gutenberg text", 11: ALICE_TEXT, 55: OZ_TEXT });
    expect(await gb.firstChapters([1, 2, 11, 55])).toMatchObject({ id: 11, chapters: expect.arrayContaining([{ seq: 12, title: "Alice’s Evidence" }]) });
    expect(fetch).toHaveBeenCalledTimes(3);
    fetch.mockClear();
    expect(await gb.firstChapters([1, 2, 3, 55])).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
