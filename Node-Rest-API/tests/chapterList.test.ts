import { readFileSync } from "fs";
import path from "path";
import { chapterList, cleanTitle, headingNumber, MIN_CHAPTERS, MAX_CHAPTERS } from "../src/corpus/chapterList";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures/gutenberg", name), "utf8");
const START = "*** START OF THE PROJECT GUTENBERG EBOOK TEST ***";
const END = "*** END OF THE PROJECT GUTENBERG EBOOK TEST ***";
// A chapter's worth of prose (comfortably over the "real text" threshold).
const prose = (n = 3) => Array.from({ length: n }, () => "It was a quiet morning and the house was still, and nobody\nhad yet come down to breakfast.").join("\n\n");
const book = (...parts: string[]) => ["Licence header", START, ...parts, END, "Licence footer"].join("\n");

describe("headingNumber", () => {
  test.each([["12", 12], ["XII", 12], ["iv", 4], ["XLIX", 49], ["the first", 1], ["THE TWELFTH", 12], ["three", 3], ["CXXXV", 135]])("%p → %p", (raw, n) =>
    expect(headingNumber(raw)).toBe(n)
  );
  test("not a number → NaN", () => expect(headingNumber("foo")).toBeNaN());
});

describe("cleanTitle", () => {
  test.each([
    [". The Cyclone.", "The Cyclone"],
    ["  —  A Caucus-Race and a Long Tale  ", "A Caucus-Race and a Long Tale"],
    ["_The Mail_", "The Mail"],
    ["THE PERIOD", "The Period"],
    ["JONATHAN HARKER’S JOURNAL--continued", "Jonathan Harker’s Journal — Continued"],
    ["Loomings.", "Loomings"],
    ["", ""],
  ])("%p → %p", (raw, out) => expect(cleanTitle(raw)).toBe(out));
  test("very long titles are cut with an ellipsis", () => {
    const t = cleanTitle("A ".repeat(80));
    expect(t.length).toBeLessThanOrEqual(101);
    expect(t.endsWith("…")).toBe(true);
  });
});

describe("chapterList on real Gutenberg books", () => {
  test("Alice: 12 chapters with titles, table of contents ignored", () => {
    const list = chapterList(fixture("pg11-alice.txt"))!;
    expect(list).toHaveLength(12);
    expect(list[0]).toEqual({ seq: 1, title: "Down the Rabbit-Hole" });
    expect(list[1].title).toBe("The Pool of Tears");
    expect(list[11]).toEqual({ seq: 12, title: "Alice’s Evidence" });
  });

  test("Oz: 24 chapters, titles on the line below the heading, the short last chapter kept", () => {
    const list = chapterList(fixture("pg55-oz.txt"))!;
    expect(list).toHaveLength(24);
    expect(list[0]).toEqual({ seq: 1, title: "The Cyclone" });
    expect(list[23]).toEqual({ seq: 24, title: "Home Again" });
    expect(list.map((c) => c.seq)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  });

  test("Pride and Prejudice (illustrated edition): all 61, no titles in the source", () => {
    const list = chapterList(readFileSync(path.join(__dirname, "../../docs/corpus/pride-and-prejudice/pg1342.txt"), "utf8"))!;
    expect(list).toHaveLength(61);
    expect(list.every((c, i) => c.seq === i + 1 && c.title === `Chapter ${i + 1}`)).toBe(true);
  });
});

describe("chapterList on edge cases", () => {
  test("headings with numbers, roman numerals and titles", () => {
    const list = chapterList(book("", "CHAPTER 1. Loomings.", "", prose(), "", "CHAPTER II", "", "The Carpet-Bag", "", prose(), "", "Chapter III: The Spouter-Inn", "", prose()))!;
    expect(list.map((c) => c.title)).toEqual(["Loomings", "The Carpet-Bag", "The Spouter-Inn"]);
  });

  test("a table of contents at the top is ignored, including its last line before the preface", () => {
    const toc = ["", "Contents", "", "CHAPTER I. One", "CHAPTER II. Two", "CHAPTER III. Three", "", "PREFACE", "", prose()];
    const list = chapterList(book(...toc, "", "CHAPTER I", "", "One", "", prose(), "", "CHAPTER II", "", "Two", "", prose(), "", "CHAPTER III", "", "Three", "", prose()))!;
    expect(list.map((c) => c.title)).toEqual(["One", "Two", "Three"]);
  });

  test("numbering that restarts in each volume becomes one running list", () => {
    const vol = (n: number) => ["", `VOLUME ${n}`, "", "CHAPTER I", "", prose(), "", "CHAPTER II", "", prose()];
    const list = chapterList(book(...vol(1), ...vol(2)))!;
    expect(list).toHaveLength(4);
    expect(list.map((c) => c.seq)).toEqual([1, 2, 3, 4]);
  });

  test("letters before chapters (Frankenstein) are kept and labelled", () => {
    const list = chapterList(book("", "Letter 1", "", prose(), "", "Letter 2", "", prose(), "", "Chapter 1", "", prose(), "", "Chapter 2", "", prose()))!;
    expect(list.map((c) => c.title)).toEqual(["Letter 1", "Letter 2", "Chapter 3", "Chapter 4"]);
  });

  test("'CHAPTER THE FIRST' style", () => {
    const list = chapterList(book("", "CHAPTER THE FIRST", "", prose(), "", "CHAPTER THE SECOND", "", prose(), "", "CHAPTER THE THIRD", "", prose()))!;
    expect(list).toHaveLength(3);
  });

  test("'chapter' in the middle of prose is not a heading", () => {
    const text = book("", "CHAPTER I", "", prose(), "chapter two of my life began that day, and", prose(), "", "CHAPTER II", "", prose(), "", "CHAPTER III", "", prose());
    expect(chapterList(text)).toHaveLength(3);
  });

  test("a prose line after the heading isn't mistaken for a title", () => {
    const list = chapterList(book("", "CHAPTER I", "", "It is a truth universally acknowledged, that a single man in possession", "of a good fortune must be in want of a wife.", "", prose(), "", "CHAPTER II", "", prose(), "", "CHAPTER III", "", prose()))!;
    expect(list[0].title).toBe("Chapter 1");
  });

  test("a gap in the numbering stops the list there (no misnumbered chapters)", () => {
    const list = chapterList(book("", "CHAPTER I", "", prose(), "", "CHAPTER II", "", prose(), "", "CHAPTER III", "", prose(), "", "CHAPTER V", "", prose()));
    expect(list).toHaveLength(3);
  });

  test(`fewer than ${MIN_CHAPTERS} chapters → null`, () => {
    expect(chapterList(book("", "CHAPTER I", "", prose(), "", "CHAPTER II", "", prose()))).toBeNull();
  });

  test(`more than ${MAX_CHAPTERS} chapters → null`, () => {
    const parts = Array.from({ length: MAX_CHAPTERS + 1 }, (_, i) => ["", `CHAPTER ${i + 1}`, "", prose(1)]).flat();
    expect(chapterList(book(...parts))).toBeNull();
  });

  test("no chapter headings (e.g. short-story collections) → null", () => {
    expect(chapterList(book("", "I. A SCANDAL IN BOHEMIA", "", prose(), "", "II. THE RED-HEADED LEAGUE", "", prose()))).toBeNull();
  });

  test("not a Gutenberg text → null", () => {
    expect(chapterList("just some text\nCHAPTER I\n" + prose())).toBeNull();
  });

  test("Windows line endings work too", () => {
    const text = book("", "CHAPTER I", "", prose(), "", "CHAPTER II", "", prose(), "", "CHAPTER III", "", prose()).replace(/\n/g, "\r\n");
    expect(chapterList(text)).toHaveLength(3);
  });
});
