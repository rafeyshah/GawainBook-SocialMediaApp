import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
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
    // Reading profile (plan §4.3, week 2). All optional.
    favoriteGenres: text("favorite_genres").array().notNull().default(sql`'{}'::text[]`),
    readingLanguage: text("reading_language"),
    pace: smallint("pace"), // chapters per week
    // Launch readiness: verified email, accepted terms, admin suspension.
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    termsVersion: text("terms_version"),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("users_username_length", sql`char_length(${t.username}) between 3 and 20`),
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("users_relationship_range", sql`${t.relationship} is null or ${t.relationship} between 1 and 3`),
    check("users_pace_range", sql`${t.pace} is null or ${t.pace} between 1 and 100`),
    check("users_genres_count", sql`coalesce(array_length(${t.favoriteGenres}, 1), 0) <= 8`),
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

// ---------- Reading: books, chapters, shelves and progress (plan §4.1) ----------

export const books = pgTable(
  "books",
  {
    id: id(),
    slug: text("slug").notNull().unique("books_slug_unique"),
    title: text("title").notNull(),
    author: text("author").notNull(),
    publishedYear: smallint("published_year"),
    description: text("description").notNull().default(""),
    // Colour for the generated cover (no cover images, so no image rights).
    coverColor: text("cover_color").notNull().default("#2f7553"),
    sourceNote: text("source_note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [check("books_cover_color_hex", sql`${t.coverColor} ~ '^#[0-9a-fA-F]{6}$'`)]
);

// seq is the canonical order (prologue = 0); progress compares against it.
export const chapters = pgTable(
  "chapters",
  {
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    seq: smallint("seq").notNull(),
    title: text("title").notNull(),
  },
  (t) => [primaryKey({ name: "chapters_pk", columns: [t.bookId, t.seq] }), check("chapters_seq_nonneg", sql`${t.seq} >= 0`)]
);

// One row per reader per book: which shelf, and how far they've read.
export const userBooks = pgTable(
  "user_books",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    shelf: text("shelf").notNull(),
    chapterSeq: smallint("chapter_seq").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: "user_books_pk", columns: [t.userId, t.bookId] }),
    check("user_books_shelf", sql`${t.shelf} in ('want', 'reading', 'finished')`),
    check("user_books_chapter_nonneg", sql`${t.chapterSeq} >= 0`),
  ]
);

// ---------- Reading circles and spoiler-safe discussions ----------

export const circles = pgTable(
  "circles",
  {
    id: id(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "restrict" }),
    visibility: text("visibility").notNull().default("public"),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inviteCode: text("invite_code").notNull().unique("circles_invite_code_unique"),
    // e.g. "3 chapters a week, Sundays" (free text for now)
    schedule: text("schedule").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    check("circles_visibility", sql`${t.visibility} in ('public', 'private')`),
    check("circles_name_length", sql`char_length(${t.name}) between 3 and 60`),
  ]
);

export const circleMembers = pgTable(
  "circle_members",
  {
    circleId: text("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: "circle_members_pk", columns: [t.circleId, t.userId] }),
    check("circle_members_role", sql`${t.role} in ('owner', 'moderator', 'member')`),
    index("circle_members_user_idx").on(t.userId),
  ]
);

export const threads = pgTable(
  "threads",
  {
    id: id(),
    circleId: text("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    chapterSeq: smallint("chapter_seq").notNull(),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    createdAt: createdAt(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    // Hidden by a moderator: kept for the record, shown as a placeholder.
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenBy: text("hidden_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    check("threads_title_length", sql`char_length(${t.title}) between 3 and 120`),
    check("threads_body_length", sql`char_length(${t.body}) <= 4000`),
    index("threads_circle_chapter_idx").on(t.circleId, t.chapterSeq),
  ]
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenBy: text("hidden_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    check("comments_body_length", sql`char_length(${t.body}) between 1 and 2000`),
    index("comments_thread_idx").on(t.threadId, t.createdAt),
  ]
);

// Invite links: expiring, use-limited codes for a circle (plan §4.3, week 3).
export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    circleId: text("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique("invitations_code_unique"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    maxUses: integer("max_uses"), // null = unlimited until it expires
    uses: integer("uses").notNull().default(0),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("invitations_max_uses", sql`${t.maxUses} is null or ${t.maxUses} between 1 and 100`),
    check("invitations_uses", sql`${t.uses} >= 0 and (${t.maxUses} is null or ${t.uses} <= ${t.maxUses})`),
    index("invitations_circle_idx").on(t.circleId),
  ]
);

// blocker no longer sees anything the blocked reader writes, and the
// blocked reader can't read the blocker's discussions.
export const blocks = pgTable(
  "blocks",
  {
    blockerId: text("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: text("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: "blocks_pk", columns: [t.blockerId, t.blockedId] }),
    check("blocks_not_self", sql`${t.blockerId} <> ${t.blockedId}`),
    index("blocks_blocked_idx").on(t.blockedId),
  ]
);

export const reports = pgTable(
  "reports",
  {
    id: id(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Null for site-wide reports (a post or a profile), which go to admins.
    circleId: text("circle_id").references(() => circles.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    details: text("details").notNull().default(""),
    status: text("status").notNull().default("open"),
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("reports_target_type", sql`${t.targetType} in ('thread', 'comment', 'post', 'user')`),
    check("reports_circle_scope", sql`(${t.targetType} in ('thread', 'comment')) = (${t.circleId} is not null)`),
    check("reports_reason", sql`${t.reason} in ('spoiler', 'harassment', 'spam', 'other')`),
    check("reports_status", sql`${t.status} in ('open', 'hidden', 'dismissed')`),
    check("reports_details_length", sql`char_length(${t.details}) <= 500`),
    // One open report per reader per item.
    uniqueIndex("reports_one_open_idx").on(t.reporterId, t.targetType, t.targetId).where(sql`${t.status} = 'open'`),
    index("reports_circle_status_idx").on(t.circleId, t.status),
  ]
);

// In-app notifications. Content is never stored here: it's loaded and
// filtered through the access rule when the reader opens the list.
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    commentId: text("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("notifications_type", sql`${t.type} in ('reply')`),
    index("notifications_user_idx").on(t.userId, t.createdAt),
  ]
);

// Single-use, expiring links sent by email (verify address, reset password).
// Only a hash of the token is stored.
export const emailTokens = pgTable(
  "email_tokens",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    tokenHash: text("token_hash").notNull().unique("email_tokens_hash_unique"),
    // For verification: the address the link was sent to (it may change).
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [check("email_tokens_kind", sql`${t.kind} in ('verify', 'reset')`), index("email_tokens_user_idx").on(t.userId, t.kind)]
);

export type User = typeof users.$inferSelect;
export type Book = typeof books.$inferSelect;
export type Circle = typeof circles.$inferSelect;
export type Thread = typeof threads.$inferSelect;
export type Post = typeof posts.$inferSelect;
