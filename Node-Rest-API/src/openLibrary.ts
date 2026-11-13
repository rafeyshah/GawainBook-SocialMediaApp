// Book search through Open Library (https://openlibrary.org/dev/docs/api/search),
// proxied by our server so the browser never calls a third party, results
// are cached, and a slow or failing Open Library never breaks the page.

export interface OpenLibraryBook {
  key: string; // e.g. "/works/OL66554W"
  title: string;
  author: string;
  year: number | null;
  coverUrl: string | null;
  editions: number;
  pages: number | null; // median page count across editions
  gutenbergIds: number[]; // Project Gutenberg eBook numbers for this work, if any
}

type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export const OPEN_LIBRARY_COVERS = "https://covers.openlibrary.org";
// Covers redirect to the Internet Archive (archive.org and its ia*.us
// mirrors); browsers check the final URL against the CSP, so allow those too.
export const COVER_IMAGE_ORIGINS = [OPEN_LIBRARY_COVERS, "https://archive.org", "https://*.archive.org"];
const SEARCH_URL = "https://openlibrary.org/search.json";
export const WORK_KEY = /^\/works\/OL\d+W$/;
const FIELDS = "key,title,author_name,first_publish_year,cover_i,edition_count,number_of_pages_median,id_project_gutenberg";

interface Options {
  fetch?: FetchLike;
  ttlMs?: number;
  maxEntries?: number;
  timeoutMs?: number;
  now?: () => number;
}

export class OpenLibrary {
  private cache = new Map<string, { at: number; value: OpenLibraryBook[] }>();
  private readonly fetchImpl: FetchLike;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  calls = 0;
  private detailCache = new Map<string, { at: number; value: WorkDetails }>();

  constructor(opts: Options = {}) {
    this.fetchImpl = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.ttlMs = opts.ttlMs ?? 6 * 60 * 60 * 1000;
    this.maxEntries = opts.maxEntries ?? 500;
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.now = opts.now ?? Date.now;
  }

  // One work by its key ("/works/OL66554W"), or null if Open Library has no such work.
  async work(key: string): Promise<OpenLibraryBook | null> {
    if (!WORK_KEY.test(key)) return null;
    const results = await this.search(`key:${key}`);
    return results.find((b) => b.key === key) ?? null;
  }

  // Description and subjects from the work's own record (/works/OL…W.json).
  async details(key: string): Promise<WorkDetails | null> {
    if (!WORK_KEY.test(key)) return null;
    const hit = this.detailCache.get(key);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.value;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let data: unknown;
    try {
      this.calls += 1;
      const res = await this.fetchImpl(`https://openlibrary.org${key}.json`, {
        headers: { "User-Agent": "GawainBook/1.0 (book club app)", Accept: "application/json" },
        signal: controller.signal,
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Open Library responded ${res.status}`);
      data = await res.json();
    } finally {
      clearTimeout(timer);
    }
    const value = parseWorkDetails(data);
    this.detailCache.set(key, { at: this.now(), value });
    return value;
  }

  static normalise(q: string): string {
    const tidy = q.trim().replace(/\s+/g, " ");
    // Work ids are case-sensitive ("key:/works/OL66534W"); everything else is not.
    return /^key:/.test(tidy) ? tidy : tidy.toLowerCase();
  }

  async search(query: string): Promise<OpenLibraryBook[]> {
    const q = OpenLibrary.normalise(query);
    const hit = this.cache.get(q);
    if (hit && this.now() - hit.at < this.ttlMs) {
      // Refresh its place so the least recently used entry is dropped first.
      this.cache.delete(q);
      this.cache.set(q, hit);
      return hit.value;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let data: unknown;
    try {
      this.calls += 1;
      const url = `${SEARCH_URL}?q=${encodeURIComponent(q)}&limit=10&fields=${FIELDS}`;
      // Open Library asks API clients to identify themselves.
      const res = await this.fetchImpl(url, { headers: { "User-Agent": "GawainBook/1.0 (book club app)", Accept: "application/json" }, signal: controller.signal });
      if (!res.ok) throw new Error(`Open Library responded ${res.status}`);
      data = await res.json();
    } finally {
      clearTimeout(timer);
    }
    const value = parseResults(data);
    this.cache.set(q, { at: this.now(), value });
    while (this.cache.size > this.maxEntries) this.cache.delete(this.cache.keys().next().value as string);
    return value;
  }
}

// Keeps only well-formed results; anything odd from the API is dropped.
export function parseResults(data: unknown): OpenLibraryBook[] {
  const docs = (data as { docs?: unknown })?.docs;
  if (!Array.isArray(docs)) return [];
  const out: OpenLibraryBook[] = [];
  for (const d of docs as Record<string, unknown>[]) {
    if (!d || typeof d.key !== "string" || !/^\/works\/OL\d+W$/.test(d.key) || typeof d.title !== "string") continue;
    const authors = Array.isArray(d.author_name) ? d.author_name.filter((a): a is string => typeof a === "string") : [];
    const cover = Number.isInteger(d.cover_i) && (d.cover_i as number) > 0 ? `${OPEN_LIBRARY_COVERS}/b/id/${d.cover_i}-M.jpg` : null;
    out.push({
      key: d.key,
      title: d.title.slice(0, 200),
      author: authors.slice(0, 2).join(", ") || "Unknown author",
      year: Number.isInteger(d.first_publish_year) ? (d.first_publish_year as number) : null,
      coverUrl: cover,
      editions: Number.isInteger(d.edition_count) ? (d.edition_count as number) : 0,
      gutenbergIds: Array.isArray(d.id_project_gutenberg)
        ? (d.id_project_gutenberg as unknown[]).map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0 && x < 1_000_000).slice(0, 5)
        : [],
      pages: Number.isInteger(d.number_of_pages_median) && (d.number_of_pages_median as number) > 0 && (d.number_of_pages_median as number) <= 20000 ? (d.number_of_pages_median as number) : null,
    });
  }
  return out;
}

export interface WorkDetails {
  description: string;
  subjects: string[];
}

export const MAX_DESCRIPTION = 1200;
export const MAX_SUBJECTS = 8;

// Open Library descriptions are free text, often with Markdown links, a
// "----------" separator before "Contains:" lists, and source notes.
export function cleanDescription(raw: unknown): string {
  const text = typeof raw === "string" ? raw : raw && typeof (raw as { value?: unknown }).value === "string" ? (raw as { value: string }).value : "";
  let t = text.replace(/\r\n?/g, "\n");
  t = t.split(/\n\s*-{3,}\s*\n/)[0]; // drop anything after a ---- separator
  t = t.replace(/\(\[source\]\[\d+\]\)/gi, ""); // ([source][1])
  t = t.replace(/^\s*\[\d+\]:\s*\S+.*$/gm, ""); // [1]: https://…
  t = t.replace(/\[([^\]]+)\]\((?:https?:)?[^)]*\)/g, "$1"); // [text](url) -> text
  t = t.replace(/\[([^\]]+)\]\[\d+\]/g, "$1"); // [text][1] -> text
  t = t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (t.length > MAX_DESCRIPTION) {
    const cut = t.slice(0, MAX_DESCRIPTION);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"));
    t = (end > MAX_DESCRIPTION * 0.6 ? cut.slice(0, end + 1) : cut.trimEnd() + "…").trim();
  }
  return t;
}

// Short, readable subjects only ("Courtship", "Regency"), no catalogue noise.
export function cleanSubjects(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    if (typeof s !== "string") continue;
    const name = s.trim().replace(/\s+/g, " ");
    if (name.length < 3 || name.length > 30) continue;
    if (/[(),:;/]|--|\d{3,}|^(fiction|accessible book|protected daisy|in library|large type books|open library staff picks)$/i.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name[0].toUpperCase() + name.slice(1));
    if (out.length === MAX_SUBJECTS) break;
  }
  return out;
}

export function parseWorkDetails(data: unknown): WorkDetails {
  const d = (data || {}) as Record<string, unknown>;
  return { description: cleanDescription(d.description), subjects: cleanSubjects(d.subjects) };
}
