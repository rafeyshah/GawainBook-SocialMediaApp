// The one place that decides who can see what (launch plan §4.2).
//
// A reader can read a chapter discussion only if:
//   1. they can see the circle (it's public, or they're a member), and
//   2. their own progress in the circle's book has reached that chapter, and
//   3. neither of them has blocked the other.
// Progress is always read from the database, never taken from the request.
import { and, eq, or } from "drizzle-orm";
import { getDb } from "./db/client";
import { blocks, circleMembers, Circle, userBooks } from "./db/schema";

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
  chapterSeq: number,
  blockedAuthor = false
): Access {
  if (!canSeeCircle(circle, role) || blockedAuthor) return "hidden";
  return progress >= chapterSeq ? "open" : "locked";
}

export const canPost = (role: Role | null): boolean => role !== null;
export const canModerate = (role: Role | null): boolean => role === "owner" || role === "moderator";

// Moderator-hidden content: moderators still see it (flagged); everyone
// else sees a placeholder (replies) or nothing (discussions).
export const canSeeHidden = canModerate;

// Who can change whose role or remove whom. Owners manage everyone but
// themselves; moderators can remove ordinary members only.
export function canManageMember(actor: Role | null, target: Role | null, action: "remove" | "role"): boolean {
  if (!actor || !target || target === "owner") return false;
  if (actor === "owner") return true;
  return actor === "moderator" && action === "remove" && target === "member";
}

// Everyone this reader has blocked or been blocked by. Blocking hides
// content in both directions.
export async function blockedIds(userId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select()
    .from(blocks)
    .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)));
  return new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)));
}

// Everything a route needs to apply the rules for one circle and reader.
export async function viewerOf(circle: Circle, userId: string) {
  const [role, progress, blocked] = await Promise.all([
    roleIn(circle.id, userId),
    progressIn(circle.bookId, userId),
    blockedIds(userId),
  ]);
  return { role, progress, blocked, visible: canSeeCircle(circle, role) };
}
