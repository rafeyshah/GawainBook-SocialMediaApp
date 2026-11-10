// The one place that decides who can see what (launch plan §4.2).
//
// A reader can read a chapter discussion only if:
//   1. they can see the circle (it's public, or they're a member), and
//   2. their own progress in the circle's book has reached that chapter.
// Progress is always read from the database, never taken from the request.
import { and, eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { circleMembers, Circle, userBooks } from "./db/schema";

export type Role = "owner" | "moderator" | "member";
export type Access = "hidden" | "locked" | "open";

export async function roleIn(circleId: string, userId: string): Promise<Role | null> {
  const [row] = await getDb()
    .select({ role: circleMembers.role })
    .from(circleMembers)
    .where(and(eq(circleMembers.circleId, circleId), eq(circleMembers.userId, userId)));
  return (row?.role as Role) ?? null;
}

// How far the reader has read this book (0 = not started).
export async function progressIn(bookId: string, userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ seq: userBooks.chapterSeq })
    .from(userBooks)
    .where(and(eq(userBooks.bookId, bookId), eq(userBooks.userId, userId)));
  return row?.seq ?? 0;
}

// Pure rules, so they're trivial to unit-test.
export const canSeeCircle = (circle: Pick<Circle, "visibility">, role: Role | null): boolean =>
  circle.visibility === "public" || role !== null;

export function threadAccess(
  circle: Pick<Circle, "visibility">,
  role: Role | null,
  progress: number,
  chapterSeq: number
): Access {
  if (!canSeeCircle(circle, role)) return "hidden";
  return progress >= chapterSeq ? "open" : "locked";
}

export const canPost = (role: Role | null): boolean => role !== null;
export const canModerate = (role: Role | null): boolean => role === "owner" || role === "moderator";

// Everything a route needs to apply the rules for one circle and reader.
export async function viewerOf(circle: Circle, userId: string) {
  const [role, progress] = await Promise.all([roleIn(circle.id, userId), progressIn(circle.bookId, userId)]);
  return { role, progress, visible: canSeeCircle(circle, role) };
}
