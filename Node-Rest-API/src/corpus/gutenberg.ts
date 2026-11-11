// Splits a Project Gutenberg plain-text book into numbered chapters.
// Pure (no I/O) so it can be tested; used to prepare a book's corpus.

export interface Chapter {
  seq: number; // 1-based, canonical order
  label: string; // e.g. "Chapter 1"
  text: string;
}

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };

/** Converts a Roman numeral (I–CCC) to a number; NaN when it isn't one. */
export function romanToInt(roman: string): number {
  const s = roman.toUpperCase();
  if (!/^[IVXLC]+$/.test(s)) return NaN;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i]];
    const next = ROMAN[s[i + 1]] ?? 0;
    total += v < next ? -v : v;
  }
  // Reject malformed numerals such as "IIII" or "VX" by round-tripping.
  return intToRoman(total) === s ? total : NaN;
}

function intToRoman(n: number): string {
  const table: [number, string][] = [
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  for (const [v, r] of table) while (n >= v) { out += r; n -= v; }
  return out;
}

/** Returns the text between the Gutenberg START and END markers. */
export function stripGutenberg(raw: string): string {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const start = text.search(/^\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG EBOOK.*\*\*\*$/m);
  const end = text.search(/^\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG EBOOK.*\*\*\*$/m);
  if (start < 0 || end < 0 || end < start) throw new Error("Not a Project Gutenberg text: START/END markers not found.");
  return text.slice(text.indexOf("\n", start) + 1, end);
}

// "CHAPTER XII." on its own line, or "Chapter I.]" closing an illustration caption.
const HEADING = /^[ \t]*chapter[ \t]+([ivxlc]+)\.?\]?[ \t]*$/gim;

/**
 * Splits a Gutenberg book into chapters. Throws unless the chapters run
 * 1, 2, 3 … without gaps or repeats, and (if given) match the expected count.
 */
export function splitChapters(raw: string, expected?: number): Chapter[] {
  const body = stripGutenberg(raw);
  const heads = [...body.matchAll(HEADING)].map((m) => ({ seq: romanToInt(m[1]), index: m.index!, length: m[0].length }));
  if (heads.length === 0) throw new Error("No chapter headings found.");
  heads.forEach((h, i) => {
    if (h.seq !== i + 1) throw new Error(`Chapter order broken at heading ${i + 1} (found ${Number.isNaN(h.seq) ? "an invalid numeral" : h.seq}).`);
  });
  if (expected !== undefined && heads.length !== expected) {
    throw new Error(`Expected ${expected} chapters, found ${heads.length}.`);
  }
  return heads.map((h, i) => {
    const endAt = i + 1 < heads.length ? heads[i + 1].index : body.length;
    const text = body
      .slice(h.index + h.length, endAt)
      .replace(/\[Illustration(?::[^\]]*)?\]/g, "") // drop illustrations and their captions
      .replace(/\[Illustration:[^\]]*$/, "") // a caption cut off by the next chapter's heading
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return { seq: h.seq, label: `Chapter ${h.seq}`, text };
  });
}
