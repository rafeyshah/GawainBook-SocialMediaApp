import { getDb } from "../src/db/client";
import { books, chapters } from "../src/db/schema";
import { signUp } from "./helpers";

let n = 0;

// A book with `count` chapters ("Chapter 1"…).
export async function makeBook(count = 10, extra: Partial<typeof books.$inferInsert> = {}) {
  n += 1;
  const [book] = await getDb()
    .insert(books)
    .values({ slug: `book-${n}`, title: `Book ${n}`, author: "A. Author", ...extra })
    .returning();
  await getDb()
    .insert(chapters)
    .values(Array.from({ length: count }, (_, i) => ({ bookId: book.id, seq: i + 1, title: `Chapter ${i + 1}` })));
  return book;
}

export type Account = Awaited<ReturnType<typeof signUp>>;

export const setProgress = (a: Account, bookId: string, chapter: number) =>
  a.client.put(`/api/books/${bookId}/progress`, { chapter });

export async function makeCircle(owner: Pick<Account, "client">, bookId: string, extra: Record<string, unknown> = {}) {
  const res = await owner.client.post("/api/circles", { name: "Test Circle", bookId, ...extra });
  if (res.status !== 201) throw new Error(`makeCircle failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { _id: string; name: string };
}

export async function makeThread(author: Pick<Account, "client">, circleId: string, chapter: number, title = `Chapter ${chapter} chat`) {
  const res = await author.client.post(`/api/circles/${circleId}/threads`, { chapter, title, body: `Secret thoughts on ${chapter}` });
  if (res.status !== 201) throw new Error(`makeThread failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { _id: string };
}
