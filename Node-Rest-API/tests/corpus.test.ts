import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { romanToInt, splitChapters, stripGutenberg } from "../src/corpus/gutenberg";
import { BOOKS } from "../src/seed/data";

const wrap = (body: string, nl = "\n") =>
  ["The Project Gutenberg eBook of Test", "Licence blurb", "*** START OF THE PROJECT GUTENBERG EBOOK TEST ***", body, "*** END OF THE PROJECT GUTENBERG EBOOK TEST ***", "Licence footer"].join(nl);

describe("romanToInt", () => {
  test.each([["I", 1], ["iv", 4], ["IX", 9], ["XIV", 14], ["XL", 40], ["XLVI", 46], ["LXI", 61], ["XC", 90], ["C", 100]])("%s → %d", (r, n) =>
    expect(romanToInt(r)).toBe(n)
  );
  test.each([["IIII"], ["VX"], ["IC"], ["ABC"], [""], ["XLX"]])("rejects %p", (r) => expect(romanToInt(r)).toBeNaN());
});

describe("stripGutenberg", () => {
  test("keeps only the text between the markers", () => {
    const body = stripGutenberg(wrap("Hello"));
    expect(body.trim()).toBe("Hello");
    expect(body).not.toMatch(/Licence/);
  });
  test("handles Windows line endings and a byte-order mark", () => {
    expect(stripGutenberg("﻿" + wrap("Hi", "\r\n")).trim()).toBe("Hi");
  });
  test.each([["no markers", "just text"], ["no END", "*** START OF THE PROJECT GUTENBERG EBOOK X ***\ntext"]])("throws with %s", (_n, raw) =>
    expect(() => stripGutenberg(raw)).toThrow(/START\/END/)
  );
});

describe("splitChapters", () => {
  test("splits on headings and numbers chapters in order", () => {
    const chapters = splitChapters(wrap("Front matter\n\nCHAPTER I.\n\nOne.\n\nCHAPTER II.\n\nTwo.\n"));
    expect(chapters).toEqual([
      { seq: 1, label: "Chapter 1", text: "One." },
      { seq: 2, label: "Chapter 2", text: "Two." },
    ]);
  });

  test("front matter before the first heading is not part of chapter 1", () => {
    const [first] = splitChapters(wrap("PREFACE by someone\n\nCHAPTER I.\nBody"));
    expect(first.text).toBe("Body");
  });

  test("recognises a heading inside an illustration caption and mixed case", () => {
    const chapters = splitChapters(wrap("[Illustration: TITLE\n\nChapter I.]\n\nOne.\n\nchapter ii\n\n[Illustration]\nTwo."));
    expect(chapters.map((c) => c.text)).toEqual(["One.", "Two."]);
  });

  test("removes illustrations, including a caption cut off by the next heading", () => {
    const chapters = splitChapters(wrap("CHAPTER I.\nOne.\n[Illustration: a ball]\nMore.\n\n[Illustration: Caption\n\nChapter II.]\nTwo."));
    expect(chapters[0].text).toBe("One.\n\nMore.");
    expect(chapters[0].text).not.toMatch(/Illustration/);
  });

  test("collapses long runs of blank lines", () => {
    expect(splitChapters(wrap("CHAPTER I.\nA\n\n\n\n\nB"))[0].text).toBe("A\n\nB");
  });

  test("does not treat 'chapter' mid-sentence as a heading", () => {
    const chapters = splitChapters(wrap("CHAPTER I.\nIn chapter II. we learn more.\nCHAPTER II.\nTwo"));
    expect(chapters).toHaveLength(2);
    expect(chapters[0].text).toMatch(/In chapter II\./);
  });

  test.each([
    ["a gap", "CHAPTER I.\na\nCHAPTER III.\nb", /broken at heading 2 \(found 3\)/],
    ["a repeat", "CHAPTER I.\na\nCHAPTER I.\nb", /broken at heading 2 \(found 1\)/],
    ["a bad numeral", "CHAPTER I.\na\nCHAPTER IIII.\nb", /invalid numeral/],
    ["not starting at 1", "CHAPTER II.\na", /broken at heading 1/],
    ["no headings", "Just prose.", /No chapter headings/],
  ])("throws on %s", (_n, body, message) => expect(() => splitChapters(wrap(body))).toThrow(message));

  test("checks the expected chapter count", () => {
    expect(() => splitChapters(wrap("CHAPTER I.\na"), 2)).toThrow("Expected 2 chapters, found 1.");
    expect(splitChapters(wrap("CHAPTER I.\na"), 1)).toHaveLength(1);
  });
});

describe("Pride and Prejudice source (docs/corpus)", () => {
  const dir = path.join(__dirname, "../../docs/corpus/pride-and-prejudice");
  const raw = readFileSync(path.join(dir, "pg1342.txt"));
  const source = readFileSync(path.join(dir, "SOURCE.md"), "utf8");
  const chapters = splitChapters(raw.toString("utf8"), 61);

  test("the file matches the checksum recorded in SOURCE.md", () => {
    const sha = createHash("sha256").update(raw).digest("hex");
    expect(source).toContain(sha);
  });

  test("has 61 chapters, matching the seeded book", () => {
    const seeded = BOOKS.find((b) => b.title === "Pride and Prejudice");
    expect(chapters).toHaveLength(61);
    expect(seeded?.chapters).toHaveLength(61);
  });

  test("starts and ends where the novel does", () => {
    expect(chapters[0].text.startsWith("It is a truth universally acknowledged")).toBe(true);
    expect(chapters[60].text).toMatch(/uniting them/);
  });

  test("no chapter is empty or still contains illustration markup or licence text", () => {
    for (const c of chapters) {
      expect(c.text.length).toBeGreaterThan(1000);
      expect(c.text).not.toMatch(/\[Illustration|Project Gutenberg|CHAPTER [IVXLC]+\./);
    }
  });
});
