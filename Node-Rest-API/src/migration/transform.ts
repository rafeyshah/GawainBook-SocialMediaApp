// Pure MongoDB → Postgres transformation, kept free of I/O so it can be tested.

type Id = string | { toString(): string };

export interface MongoUser {
  _id: Id;
  username?: string;
  email?: string;
  password?: string;
  profilePicture?: string;
  coverPicture?: string;
  isAdmin?: boolean;
  desc?: string;
  city?: string;
  from?: string;
  relationship?: number;
  followings?: Id[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MongoPost {
  _id: Id;
  userId?: Id;
  desc?: string;
  img?: string;
  likes?: Id[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UserRow {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  profilePicture: string;
  coverPicture: string;
  isAdmin: boolean;
  bio: string | null;
  city: string | null;
  hometown: string | null;
  relationship: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostRow {
  id: string;
  userId: string;
  description: string;
  imageKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ImageCopy {
  /** Original file name on the old server disk. */
  source: string;
  /** Destination key in object storage. */
  key: string;
}

export interface MigrationPlan {
  users: UserRow[];
  follows: { followerId: string; followingId: string }[];
  posts: PostRow[];
  likes: { postId: string; userId: string }[];
  images: ImageCopy[];
  skipped: string[];
}

const str = (id: Id | undefined): string => (id === undefined || id === null ? "" : String(id));
const clean = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, 200) : null;
};

// "1617 cover photo.jpeg" → "uploads/1617-cover-photo.jpeg"
export const imageKeyFor = (fileName: string): string =>
  "uploads/" + fileName.replace(/[^\w.-]+/g, "-").replace(/\.(?=.*\.)/g, "-");

export function planMigration(
  mongoUsers: MongoUser[],
  mongoPosts: MongoPost[],
  imageExists: (fileName: string) => boolean,
  now: Date = new Date()
): MigrationPlan {
  const plan: MigrationPlan = { users: [], follows: [], posts: [], likes: [], images: [], skipped: [] };
  const seenEmails = new Set<string>();
  const seenUsernames = new Set<string>();
  const userIds = new Set<string>();

  for (const u of mongoUsers) {
    const id = str(u._id);
    const username = (u.username || "").trim();
    const email = (u.email || "").trim().toLowerCase();
    if (username.length < 3 || username.length > 20) {
      plan.skipped.push(`user ${id}: username "${username}" must be 3–20 characters`);
      continue;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      plan.skipped.push(`user ${id}: invalid email`);
      continue;
    }
    if (!u.password) {
      plan.skipped.push(`user ${id}: no password hash`);
      continue;
    }
    if (seenEmails.has(email)) {
      plan.skipped.push(`user ${id}: duplicate email ${email}`);
      continue;
    }
    if (seenUsernames.has(username)) {
      plan.skipped.push(`user ${id}: duplicate username ${username}`);
      continue;
    }
    seenEmails.add(email);
    seenUsernames.add(username);
    userIds.add(id);
    const rel = Number(u.relationship);
    plan.users.push({
      id,
      username,
      email,
      passwordHash: u.password,
      profilePicture: u.profilePicture || "",
      coverPicture: u.coverPicture || "",
      isAdmin: Boolean(u.isAdmin),
      bio: clean(u.desc),
      city: clean(u.city),
      hometown: clean(u.from),
      relationship: [1, 2, 3].includes(rel) ? rel : null,
      createdAt: u.createdAt || now,
      updatedAt: u.updatedAt || u.createdAt || now,
    });
  }

  const followKeys = new Set<string>();
  for (const u of mongoUsers) {
    const followerId = str(u._id);
    if (!userIds.has(followerId)) continue;
    for (const raw of u.followings || []) {
      const followingId = str(raw);
      const key = `${followerId}>${followingId}`;
      if (followingId === followerId || !userIds.has(followingId) || followKeys.has(key)) continue;
      followKeys.add(key);
      plan.follows.push({ followerId, followingId });
    }
  }

  for (const p of mongoPosts) {
    const id = str(p._id);
    const userId = str(p.userId);
    if (!userIds.has(userId)) {
      plan.skipped.push(`post ${id}: author ${userId} not migrated`);
      continue;
    }
    const description = (p.desc || "").trim();
    if (description.length > 500) {
      plan.skipped.push(`post ${id}: text longer than 500 characters`);
      continue;
    }
    let imageKey: string | null = null;
    if (p.img) {
      if (/[\\/]|\.\./.test(p.img)) {
        plan.skipped.push(`post ${id}: unsafe image path dropped`);
      } else if (imageExists(p.img)) {
        imageKey = imageKeyFor(p.img);
        plan.images.push({ source: p.img, key: imageKey });
      } else {
        plan.skipped.push(`post ${id}: image ${p.img} no longer on disk, dropped`);
      }
    }
    if (!description && !imageKey) {
      plan.skipped.push(`post ${id}: empty after dropping its image`);
      continue;
    }
    plan.posts.push({
      id,
      userId,
      description,
      imageKey,
      createdAt: p.createdAt || now,
      updatedAt: p.updatedAt || p.createdAt || now,
    });
    const likers = new Set<string>();
    for (const raw of p.likes || []) {
      const likerId = str(raw);
      if (userIds.has(likerId) && !likers.has(likerId)) {
        likers.add(likerId);
        plan.likes.push({ postId: id, userId: likerId });
      }
    }
  }

  return plan;
}
