// Chapter lists for public-domain books, from Project Gutenberg.
//
// Open Library records list a work's Gutenberg eBook numbers. We download the
// plain text once, read its chapter headings (src/corpus/chapterList.ts) and
// keep only the list. The book's text is never stored or served.
import { chapterList, ChapterEntry } from "./corpus/chapterList";

type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export const MAX_TEXT_BYTES = 8 * 1024 * 1024; // the longest novels are ~3 MB
export const gutenbergTextUrl = (id: number) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;

export interface GutenbergChapters {
  id: number;
  chapters: ChapterEntry[];
}

export class Gutenberg {
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  calls = 0;

  constructor(opts: { fetch?: FetchLike; timeoutMs?: number } = {}) {
    this.fetchImpl = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  /** The chapter list of one eBook, or null (not found, not plain text, no reliable chapters). */
  async chapters(id: number): Promise<ChapterEntry[] | null> {
    if (!Number.isInteger(id) || id <= 0 || id >= 1_000_000) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      this.calls += 1;
      const res = await this.fetchImpl(gutenbergTextUrl(id), {
        headers: { "User-Agent": "GawainBook/1.0 (book club app; chapter lists only)", Accept: "text/plain" },
        signal: controller.signal,
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Project Gutenberg responded ${res.status}`);
      const text = await res.text();
      if (text.length > MAX_TEXT_BYTES) return null;
      return chapterList(text);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Tries each eBook number in turn; the first with a reliable chapter list wins. */
  async firstChapters(ids: number[]): Promise<GutenbergChapters | null> {
    for (const id of ids.slice(0, 3)) {
      const chapters = await this.chapters(id);
      if (chapters) return { id, chapters };
    }
    return null;
  }
}
