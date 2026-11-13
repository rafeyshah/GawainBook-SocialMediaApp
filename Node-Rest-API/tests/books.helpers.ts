// Fakes for the book sources (Open Library, Project Gutenberg) and a reader
// signed in to an app that uses them. Shared by every book test.
import { readFileSync } from "fs";
import path from "path";
import { OpenLibrary } from "../src/openLibrary";
import { Gutenberg } from "../src/gutenberg";
import { Client, CONSENT, makeApp, offlineGutenberg } from "./helpers";

export const gutenbergText = (file: string) => readFileSync(path.join(__dirname, "fixtures/gutenberg", file), "utf8");
export const OZ_TEXT = gutenbergText("pg55-oz.txt"); // 24 titled chapters
export const ALICE_TEXT = gutenbergText("pg11-alice.txt"); // 12 titled chapters

type Doc = Record<string, unknown> & { key: string };

// Open Library search docs. Extra `description` / `subjects` are served from
// the work's own record (/works/OL…W.json), as the real API does.
export const OZ: Doc = { key: "/works/OL18417W", title: "The Wonderful Wizard of Oz", author_name: ["L. Frank Baum"], first_publish_year: 1900, id_project_gutenberg: ["55"] };
export const MANSFIELD: Doc = {
  key: "/works/OL10W",
  title: "Mansfield Park",
  author_name: ["Jane Austen"],
  first_publish_year: 1814,
  cover_i: 77,
  number_of_pages_median: 480,
  description: "Fanny Price is sent to live with her rich relatives at Mansfield Park. ([source][1])\n\n[1]: https://en.wikipedia.org/wiki/Mansfield_Park",
  subjects: ["Fiction", "Courtship", "England -- Fiction", "Regency", "courtship", "Families", "Accessible book", "Young women"],
};
export const doc = (n: number, extra: Record<string, unknown> = {}): Doc => ({ key: `/works/OL${n}W`, title: `Book ${n}`, author_name: ["Some Author"], first_publish_year: 1900 + n, cover_i: 500 + n, edition_count: 3, ...extra });

// A fake Open Library over `docs`. `down` fails every call; `detailsDown` only the work records.
export function fakeOpenLibrary(docs: Doc[] = [], opts: { down?: boolean; detailsDown?: boolean } = {}) {
  const fetch = jest.fn(async (url: string) => {
    if (opts.down) throw new Error("down");
    const work = url.match(/^https:\/\/openlibrary\.org(\/works\/OL\d+W)\.json$/)?.[1];
    if (work) {
      if (opts.detailsDown) throw new Error("down");
      const d = docs.find((x) => x.key === work);
      return d ? { ok: true, status: 200, json: async () => ({ description: d.description, subjects: d.subjects }) } : { ok: false, status: 404, json: async () => ({}) };
    }
    const q = decodeURIComponent(new URL(url).searchParams.get("q") || "");
    const key = q.match(/^key:(\/works\/OL\d+W)$/)?.[1];
    return { ok: true, status: 200, json: async () => ({ docs: key ? docs.filter((d) => d.key === key) : docs }) };
  });
  return { ol: new OpenLibrary({ fetch: fetch as never }), fetch };
}

// A fake Project Gutenberg. `texts` maps eBook id → text, an Error to throw, or an
// HTTP status; missing ids are 404. Tests may change `texts` later (e.g. to take it down).
export function fakeGutenberg(texts: Record<number, string | Error | number> = {}) {
  const fetch = jest.fn(async (url: string) => {
    const t = texts[Number(url.match(/pg(\d+)\.txt$/)?.[1])];
    if (t instanceof Error) throw t;
    if (typeof t === "number") return { ok: false, status: t, text: async () => "" };
    if (t === undefined) return { ok: false, status: 404, text: async () => "" };
    return { ok: true, status: 200, text: async () => t };
  });
  return { gb: new Gutenberg({ fetch: fetch as never }), fetch, texts };
}

let n = 0;
// A newly registered reader on an app wired to these sources.
export async function bookReader(ol: OpenLibrary = fakeOpenLibrary().ol, gb: Gutenberg = offlineGutenberg()) {
  const i = ++n; // taken before any await, so readers made in parallel never collide
  const c = await new Client(makeApp({}, ol, gb)).init();
  const res = await c.post("/api/auth/register", { username: `bk${i}x`, email: `bk${i}@example.com`, password: "secret123", ...CONSENT });
  return Object.assign(c, { userId: res.body._id as string });
}
export type BookReader = Awaited<ReturnType<typeof bookReader>>;

// Imports `key` for `reader` and returns the new book's id.
export async function importBook(reader: BookReader, key: string, shelf?: string) {
  const res = await reader.post("/api/books/import", shelf ? { key, shelf } : { key });
  if (res.status >= 300) throw new Error(`import failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.book._id as string;
}
