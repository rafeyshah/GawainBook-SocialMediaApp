// Reads the chapter list (numbers and titles only) out of a Project
// Gutenberg plain-text book. Only the list is kept, never the book's text.
//
// Gutenberg texts vary a lot. This copes with:
//   CHAPTER 1 / CHAPTER I. / Chapter I. The Cyclone / CHAPTER I   The Period
//   a title on the line after the heading ("Chapter I" / "The Cyclone")
//   Letter 1 … (Frankenstein), Stave I (A Christmas Carol), CHAPTER THE FIRST
//   numbering that restarts in each volume or book (Emma, A Tale of Two Cities)
//   a table of contents at the top (its lines are dropped: no text follows them)
// and gives up (returns null) when the result doesn't look like a real list.
import { stripGutenberg } from "./gutenberg";

export interface ChapterEntry {
  seq: number; // 1, 2, 3 … in reading order
  title: string; // "The Cyclone", or "Chapter 3" when the book gives no title
}

export const MIN_CHAPTERS = 3;
export const MAX_CHAPTERS = 200;
// A real chapter is followed by real text; a table-of-contents line isn't.
export const MIN_CHAPTER_TEXT = 100;
const MAX_TITLE = 100;

const NUMBER_WORDS = "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve";
// The heading word, a number (digits, roman numerals or "the first"), then an optional title.
const HEADING = new RegExp(
  String.raw`^[ \t]*(chapter|letter|stave)[ \t]+(\d{1,3}|[ivxlcdm]{1,8}|the[ \t]+(?:${NUMBER_WORDS})|(?:${NUMBER_WORDS}))\b[.:]?\]?(.*)$`,
  "i"
);

const WORD_NUMBERS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

/** "12", "XII", "the twelfth" -> 12; NaN if it isn't a number. */
export function headingNumber(raw: string): number {
  const s = raw.trim().toLowerCase().replace(/^the\s+/, "");
  if (/^\d+$/.test(s)) return Number(s);
  if (s in WORD_NUMBERS) return WORD_NUMBERS[s];
  if (/^[ivxlcdm]+$/.test(s)) {
    let total = 0;
    for (let i = 0; i < s.length; i++) {
      const v = ROMAN[s[i]];
      total += v < (ROMAN[s[i + 1]] ?? 0) ? -v : v;
    }
    return total;
  }
  return NaN;
}

// Tidies a chapter title: no leading "." "—" ":", no trailing full stop, sane case.
export function cleanTitle(raw: string): string {
  let t = raw
    .replace(/[_*]/g, "") // Gutenberg _italics_ and *bold*
    .replace(/\s*--\s*/g, " — ")
    .replace(/^[\s.:\-—–]+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.:;,]+$/, "")
    .trim();
  if (!t) return "";
  // SHOUTING TITLES (mostly capitals) -> Title case.
  const letters = t.replace(/[^\p{L}]/gu, "");
  const caps = letters.replace(/[^\p{Lu}]/gu, "").length;
  if (letters.length >= 3 && caps / letters.length > 0.7) {
    t = t.toLowerCase().replace(/(^|[\s"'“‘(\-])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());
  }
  return t.length > MAX_TITLE ? t.slice(0, MAX_TITLE).trimEnd() + "…" : t;
}

// A line that could be a chapter title on its own: short, not a sentence that
// carries on, and not the start of the chapter's prose.
function looksLikeTitle(line: string, after: string | undefined): boolean {
  const t = line.trim();
  if (!t || t.length > 70) return false;
  if (/[,;]$/.test(t)) return false;
  if (/^[a-z]/.test(t)) return false;
  if (/^\[illustration/i.test(t)) return false;
  // A title stands alone: the next line is blank (prose would carry on).
  return after === undefined || after.trim() === "";
}

/** The chapter list of a Gutenberg book, or null if none can be found reliably. */
export function chapterList(raw: string): ChapterEntry[] | null {
  let body: string;
  try {
    body = stripGutenberg(raw);
  } catch {
    return null;
  }
  const lines = body.split("\n");
  // Heading candidates: on their own line, after a blank line (or a "]" of an
  // illustration caption, as in illustrated editions).
  const heads: { line: number; title: string; num: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADING);
    if (!m) continue;
    if (lines[i].trim().length > 90) continue;
    const prev = i > 0 ? lines[i - 1].trim() : "";
    if (prev !== "" && !/^\[illustration/i.test(prev) && !/\]$/.test(prev) && !HEADING.test(prev)) continue;
    const kind = m[1].toLowerCase();
    let title = cleanTitle(m[3] || "");
    if (!title) {
      // Title on the next non-empty line (within two lines), if it reads like one.
      for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
        if (lines[j].trim() === "") continue;
        if (!HEADING.test(lines[j]) && looksLikeTitle(lines[j], lines[j + 1])) title = cleanTitle(lines[j]);
        break;
      }
    }
    if (!title && kind !== "chapter") {
      // Keep "Letter 4" / "Stave 2" so readers can tell them apart.
      title = `${kind[0].toUpperCase()}${kind.slice(1)} ${m[2].toUpperCase().replace(/^THE\s+/, "")}`;
    }
    heads.push({ line: i, title, num: headingNumber(m[2]) });
  }

  // Drop table-of-contents entries: a real chapter has real text before the next heading.
  const withText = heads.filter((h, k) => {
    const end = k + 1 < heads.length ? heads[k + 1].line : lines.length;
    const text = lines.slice(h.line + 1, end).join("\n").replace(/\[Illustration[^\]]*\]/gi, "").trim();
    return text.length >= MIN_CHAPTER_TEXT;
  });
  // In reading order each chapter is the next number, or starts again at 1
  // (a new volume, book or part). This also drops the table of contents'
  // last line, which is followed by the preface and so "has text".
  const chapters: typeof withText = [];
  let expected = 1;
  for (const h of withText) {
    if (h.num === expected || h.num === 1) {
      chapters.push(h);
      expected = h.num + 1;
    }
  }
  if (chapters.length < MIN_CHAPTERS || chapters.length > MAX_CHAPTERS) return null;
  return chapters.map((h, k) => ({ seq: k + 1, title: h.title || `Chapter ${k + 1}` }));
}
