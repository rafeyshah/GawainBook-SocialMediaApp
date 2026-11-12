import { count, eq, inArray } from "drizzle-orm";
import type { Db } from "./db/client";
import { follows, postComments, postLikes, Post, User } from "./db/schema";

// API shapes match what the React app already uses (Mongo-era field names),
// so the frontend didn't need to change when the database did.

export interface PublicProfile {
  _id: string;
  username: string;
  profilePicture: string;
  coverPicture: string;
  followers: string[];
  followings: string[];
  desc: string | null;
  city: string | null;
  from: string | null;
  relationship: number | null;
  favoriteGenres: string[];
  readingLanguage: string | null;
  pace: number | null;
  createdAt: Date;
}

export async function followIds(db: Db, userId: string): Promise<{ followers: string[]; followings: string[] }> {
  const [followerRows, followingRows] = await Promise.all([
    db.select({ id: follows.followerId }).from(follows).where(eq(follows.followingId, userId)),
    db.select({ id: follows.followingId }).from(follows).where(eq(follows.followerId, userId)),
  ]);
  return { followers: followerRows.map((r) => r.id), followings: followingRows.map((r) => r.id) };
}

// Fields anyone may see. Never the password hash, email or admin flag.
export async function publicProfile(db: Db, user: User): Promise<PublicProfile> {
  const { followers, followings } = await followIds(db, user.id);
  return {
    _id: user.id,
    username: user.username,
    profilePicture: user.profilePicture,
    coverPicture: user.coverPicture,
    followers,
    followings,
    desc: user.bio,
    city: user.city,
    from: user.hometown,
    relationship: user.relationship,
    favoriteGenres: user.favoriteGenres,
    readingLanguage: user.readingLanguage,
    pace: user.pace,
    createdAt: user.createdAt,
  };
}

// The signed-in user's own view adds email and the admin flag.
export async function ownAccount(db: Db, user: User) {
  return { ...(await publicProfile(db, user)), email: user.email, isAdmin: user.isAdmin, emailVerified: Boolean(user.emailVerifiedAt) };
}

export interface PostDto {
  _id: string;
  userId: string;
  desc: string;
  img?: string;
  likes: string[];
  commentCount: number;
  spoiler: boolean;
  spoilerFor: string | null;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function postDtos(db: Db, rows: Post[]): Promise<PostDto[]> {
  if (rows.length === 0) return [];
  const likeRows = await db
    .select({ postId: postLikes.postId, userId: postLikes.userId })
    .from(postLikes)
    .where(inArray(postLikes.postId, rows.map((p) => p.id)));
  const likes = new Map<string, string[]>();
  for (const l of likeRows) likes.set(l.postId, [...(likes.get(l.postId) || []), l.userId]);
  const countRows = await db
    .select({ postId: postComments.postId, n: count() })
    .from(postComments)
    .where(inArray(postComments.postId, rows.map((p) => p.id)))
    .groupBy(postComments.postId);
  const comments = new Map(countRows.map((r) => [r.postId, Number(r.n)]));
  return rows.map((p) => ({
    _id: p.id,
    userId: p.userId,
    desc: p.description,
    ...(p.imageKey ? { img: p.imageKey } : {}),
    likes: likes.get(p.id) || [],
    commentCount: comments.get(p.id) ?? 0,
    spoiler: p.spoiler,
    spoilerFor: p.spoilerFor,
    editedAt: p.editedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));
}
