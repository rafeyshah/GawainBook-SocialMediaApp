import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Ids are text so rows migrated from MongoDB keep their ObjectId strings
// (existing sessions keep working); new rows get a UUID.
const id = () => text("id").primaryKey().default(sql`gen_random_uuid()::text`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: id(),
    username: text("username").notNull().unique("users_username_unique"),
    email: text("email").notNull().unique("users_email_unique"),
    passwordHash: text("password_hash").notNull(),
    profilePicture: text("profile_picture").notNull().default(""),
    coverPicture: text("cover_picture").notNull().default(""),
    isAdmin: boolean("is_admin").notNull().default(false),
    bio: text("bio"),
    city: text("city"),
    hometown: text("hometown"),
    relationship: smallint("relationship"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("users_username_length", sql`char_length(${t.username}) between 3 and 20`),
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("users_relationship_range", sql`${t.relationship} is null or ${t.relationship} between 1 and 3`),
  ]
);

export const follows = pgTable(
  "follows",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followingId: text("following_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: "follows_pk", columns: [t.followerId, t.followingId] }),
    check("follows_not_self", sql`${t.followerId} <> ${t.followingId}`),
    index("follows_following_idx").on(t.followingId),
  ]
);

export const posts = pgTable(
  "posts",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    description: text("description").notNull().default(""),
    imageKey: text("image_key"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("posts_description_length", sql`char_length(${t.description}) <= 500`),
    check("posts_not_empty", sql`${t.description} <> '' or ${t.imageKey} is not null`),
    index("posts_user_created_idx").on(t.userId, t.createdAt.desc()),
  ]
);

export const postLikes = pgTable(
  "post_likes",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ name: "post_likes_pk", columns: [t.postId, t.userId] })]
);

// Server-side sessions (D2). Only a SHA-256 hash of the cookie token is
// stored, so a database leak can't be replayed as a login.
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)]
);

export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: id(),
    email: text("email").notNull().unique("waitlist_email_unique"),
    favouriteGenre: text("favourite_genre").notNull(),
    organizesBookClub: boolean("organizes_book_club").notNull().default(false),
    // When and to which version of the privacy notice they agreed.
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull().defaultNow(),
    privacyVersion: text("privacy_version").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("waitlist_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("waitlist_email_length", sql`char_length(${t.email}) <= 254`),
  ]
);

export type User = typeof users.$inferSelect;
export type Post = typeof posts.$inferSelect;
