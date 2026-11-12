import { TERMS_VERSION } from "../legal";
import bcrypt from "bcryptjs";
import { and, eq, inArray, like } from "drizzle-orm";
import type { Db } from "../db/client";
import { books, chapters, circleMembers, circles, comments, follows, postComments, postLikes, posts, threads, userBooks, users } from "../db/schema";
import {
  BOOKS,
  CIRCLES,
  FOLLOWS_FOR_MEMBERS,
  MEMBER_READING,
  POSTS,
  SAMPLE_BIO,
  SAMPLE_FOLLOWS,
  SAMPLE_EMAIL_DOMAIN,
  SAMPLE_USERS,
  SeedUser,
  SOURCE_NOTE,
} from "./data";

// Sample accounts count as verified and as having accepted the current terms.
const sampleConsent = () => ({ emailVerifiedAt: new Date(), termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION });
const sampleProfile = (u: SeedUser) =>
  u.profile ? { favoriteGenres: u.profile.genres, readingLanguage: u.profile.language, pace: u.profile.pace } : {};

export const sampleEmail = (username: string) => `${username}@${SAMPLE_EMAIL_DOMAIN}`;
const hoursAgo = (h: number, now: Date) => new Date(now.getTime() - h * 3600_000);

export interface SeedSummary {
  books: number;
  sampleUsers: number;
  circles: number;
  threads: number;
  comments: number;
  posts: number;
  postComments: number;
  realMembers: string[];
}

// Creates or updates the demo data. Safe to run repeatedly: books, users and
// circles are matched by slug, username and invite code; threads, comments
// and posts by their text.
export async function seedDemo(
  db: Db,
  options: { password: string; members?: string[]; now?: Date }
): Promise<SeedSummary> {
  const now = options.now ?? new Date();
  const passwordHash = await bcrypt.hash(options.password, 10);

  return db.transaction(async (tx) => {
    // Books and chapters.
    const bookId = new Map<string, string>();
    for (const b of BOOKS) {
      const [row] = await tx
        .insert(books)
        .values({
          slug: b.slug,
          title: b.title,
          author: b.author,
          publishedYear: b.publishedYear,
          coverColor: b.coverColor,
          description: b.description,
          sourceNote: SOURCE_NOTE,
        })
        .onConflictDoUpdate({
          target: books.slug,
          set: { title: b.title, author: b.author, description: b.description, coverColor: b.coverColor, sourceNote: SOURCE_NOTE },
        })
        .returning({ id: books.id });
      bookId.set(b.slug, row.id);
      await tx
        .insert(chapters)
        .values(b.chapters.map((title, i) => ({ bookId: row.id, seq: i + 1, title })))
        .onConflictDoNothing();
    }

    // Sample users. Never take over a real account that has the same name.
    const userId = new Map<string, string>();
    for (const u of SAMPLE_USERS) {
      const [existing] = await tx.select().from(users).where(eq(users.username, u.username));
      if (existing && existing.email !== sampleEmail(u.username)) {
        throw new Error(`A real account already uses the username "${u.username}"; refusing to overwrite it.`);
      }
      const [row] = existing
        ? await tx
            .update(users)
            .set({ passwordHash, bio: SAMPLE_BIO, city: u.city ?? null, profilePicture: u.photo ?? "", ...sampleConsent(), ...sampleProfile(u) })
            .where(eq(users.id, existing.id))
            .returning()
        : await tx
            .insert(users)
            .values({
              username: u.username,
              email: sampleEmail(u.username),
              passwordHash,
              bio: SAMPLE_BIO,
              city: u.city ?? null,
              profilePicture: u.photo ?? "",
              ...sampleConsent(),
              ...sampleProfile(u),
            })
            .returning();
      userId.set(u.username, row.id);
    }

    // Real accounts to include (e.g. your own), looked up by username.
    const realMembers: string[] = [];
    for (const name of options.members ?? []) {
      const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.username, name));
      if (!row) throw new Error(`No account called "${name}".`);
      userId.set(name, row.id);
      realMembers.push(name);
    }

    const setReading = async (name: string, reading: SeedUser["reading"]) => {
      for (const [slug, [shelf, chapter]] of Object.entries(reading)) {
        await tx
          .insert(userBooks)
          .values({ userId: userId.get(name)!, bookId: bookId.get(slug)!, shelf, chapterSeq: chapter, updatedAt: now })
          .onConflictDoUpdate({ target: [userBooks.userId, userBooks.bookId], set: { shelf, chapterSeq: chapter } });
      }
    };
    for (const u of SAMPLE_USERS) await setReading(u.username, u.reading);
    for (const name of realMembers) await setReading(name, MEMBER_READING);

    // Circles, members, threads and comments.
    let threadCount = 0;
    let commentCount = 0;
    for (const c of CIRCLES) {
      const [row] = await tx
        .insert(circles)
        .values({
          name: c.name,
          description: c.description,
          bookId: bookId.get(c.book)!,
          visibility: c.visibility,
          schedule: c.schedule,
          ownerId: userId.get(c.owner)!,
          inviteCode: c.inviteCode,
          createdAt: hoursAgo(200, now),
        })
        .onConflictDoUpdate({
          target: circles.inviteCode,
          set: { name: c.name, description: c.description, visibility: c.visibility, schedule: c.schedule },
        })
        .returning({ id: circles.id });
      const circleId = row.id;

      const members: [string, "owner" | "moderator" | "member"][] = [
        [c.owner, "owner"],
        ...c.members.map((m): [string, "moderator" | "member"] => [m, c.moderators?.includes(m) ? "moderator" : "member"]),
        ...(c.includeRealMembers ? realMembers.map((m): [string, "member"] => [m, "member"]) : []),
      ];
      for (const [name, role] of members) {
        await tx.insert(circleMembers).values({ circleId, userId: userId.get(name)!, role }).onConflictDoNothing();
      }

      for (const t of c.threads) {
        let [thread] = await tx
          .select({ id: threads.id })
          .from(threads)
          .where(and(eq(threads.circleId, circleId), eq(threads.title, t.title)));
        if (!thread) {
          [thread] = await tx
            .insert(threads)
            .values({ circleId, chapterSeq: t.chapter, authorId: userId.get(t.author)!, title: t.title, body: t.body, createdAt: hoursAgo(t.hoursAgo, now) })
            .returning({ id: threads.id });
        }
        threadCount++;
        for (const [i, cm] of t.comments.entries()) {
          const authorId = userId.get(cm.author)!;
          const [exists] = await tx
            .select({ id: comments.id })
            .from(comments)
            .where(and(eq(comments.threadId, thread.id), eq(comments.authorId, authorId), eq(comments.body, cm.body)));
          if (!exists) {
            await tx.insert(comments).values({ threadId: thread.id, authorId, body: cm.body, createdAt: hoursAgo(t.hoursAgo - (i + 1), now) });
          }
          commentCount++;
        }
      }
    }

    // Feed posts, likes and comments (matched by text, so re-runs don't duplicate).
    let postCommentCount = 0;
    for (const p of POSTS) {
      const authorId = userId.get(p.author)!;
      let [post] = await tx.select({ id: posts.id }).from(posts).where(and(eq(posts.userId, authorId), eq(posts.description, p.desc)));
      if (!post) {
        [post] = await tx
          .insert(posts)
          .values({ userId: authorId, description: p.desc, spoiler: Boolean(p.spoiler), spoilerFor: p.spoilerFor ?? null, createdAt: hoursAgo(p.hoursAgo, now) })
          .returning({ id: posts.id });
      }
      for (const liker of p.likes ?? []) {
        await tx.insert(postLikes).values({ postId: post.id, userId: userId.get(liker)! }).onConflictDoNothing();
      }
      for (const [i, cm] of (p.comments ?? []).entries()) {
        const commenter = userId.get(cm.author)!;
        const [exists] = await tx
          .select({ id: postComments.id })
          .from(postComments)
          .where(and(eq(postComments.postId, post.id), eq(postComments.authorId, commenter), eq(postComments.body, cm.body)));
        if (!exists) {
          // Spread replies out after the post, oldest first.
          const at = hoursAgo(Math.max(0.1, p.hoursAgo - (i + 1) * Math.min(1.5, p.hoursAgo / ((p.comments?.length ?? 1) + 1))), now);
          await tx.insert(postComments).values({ postId: post.id, authorId: commenter, body: cm.body, createdAt: at });
        }
        postCommentCount++;
      }
    }
    for (const [follower, following] of SAMPLE_FOLLOWS) {
      await tx.insert(follows).values({ followerId: userId.get(follower)!, followingId: userId.get(following)! }).onConflictDoNothing();
    }
    for (const name of realMembers) {
      for (const target of FOLLOWS_FOR_MEMBERS) {
        await tx.insert(follows).values({ followerId: userId.get(name)!, followingId: userId.get(target)! }).onConflictDoNothing();
      }
    }

    return {
      books: BOOKS.length,
      sampleUsers: SAMPLE_USERS.length,
      circles: CIRCLES.length,
      threads: threadCount,
      comments: commentCount,
      posts: POSTS.length,
      postComments: postCommentCount,
      realMembers,
    };
  });
}

// Removes every sample account (and, by cascade, their circles, threads,
// comments, posts and follows), then the demo books. Real accounts stay;
// they only lose their memberships in the sample circles.
export async function removeDemo(db: Db): Promise<{ sampleUsers: number }> {
  return db.transaction(async (tx) => {
    const removed = await tx.delete(users).where(like(users.email, `%@${SAMPLE_EMAIL_DOMAIN}`)).returning({ id: users.id });
    const slugs = BOOKS.map((b) => b.slug);
    const stillUsed = await tx
      .select({ bookId: circles.bookId })
      .from(circles)
      .innerJoin(books, eq(books.id, circles.bookId))
      .where(inArray(books.slug, slugs));
    const keep = new Set(stillUsed.map((r) => r.bookId));
    const demoBooks = await tx.select({ id: books.id }).from(books).where(inArray(books.slug, slugs));
    const toDelete = demoBooks.map((b) => b.id).filter((id) => !keep.has(id));
    if (toDelete.length) await tx.delete(books).where(inArray(books.id, toDelete));
    return { sampleUsers: removed.length };
  });
}
