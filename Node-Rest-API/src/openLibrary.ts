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
const FIELDS = "key,title,author_name,first_publish_year,cover_i,edition_count";

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
    });
  }
  return out;
}
