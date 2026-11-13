// Account lifecycle: verify your email, reset a forgotten password, change
// your password, download your data, delete your account.
import crypto from "crypto";
import { Request, RequestHandler, Router } from "express";
import bcrypt from "bcryptjs";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  blocks,
  circleMembers,
  circles,
  comments,
  emailTokens,
  follows,
  notifications,
  postLikes,
  posts,
  reports,
  threads,
  User,
  userBooks,
  users,
  books,
} from "../db/schema";
import { handle, HttpError } from "../http";
import { endAllSessions, endSession, hashToken, requireAuth, startSession } from "../auth";
import { LoginThrottle } from "../loginThrottle";
import { ownAccount } from "../serializers";
import { Mailer, renderEmail } from "../mailer";
import { normalizeEmail } from "./auth";

export const VERIFY_TTL_MS = 48 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;
// Don't send the same kind of email to one account more than once a minute.
export const RESEND_COOLDOWN_MS = 60 * 1000;

export const PASSWORD_RULE = { min: 8, max: 72 };
export function checkNewPassword(pw: unknown): string {
  const password = String(pw ?? "");
  if (password.length < PASSWORD_RULE.min) throw new HttpError(400, `Passwords must be at least ${PASSWORD_RULE.min} characters.`);
  if (password.length > PASSWORD_RULE.max) throw new HttpError(400, `Passwords must be at most ${PASSWORD_RULE.max} characters.`);
  return password;
}

// Links in emails point at APP_URL (set in production) so a forged Host
// header can never redirect a reset link somewhere else.
export function appUrl(req: Request): string {
  const configured = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  return `${req.protocol}://${req.get("host")}`;
}

type Kind = "verify" | "reset";

async function recentlySent(userId: string, kind: Kind): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: emailTokens.id })
    .from(emailTokens)
    .where(and(eq(emailTokens.userId, userId), eq(emailTokens.kind, kind), gt(emailTokens.createdAt, new Date(Date.now() - RESEND_COOLDOWN_MS))));
  return Boolean(row);
}

async function issueToken(user: User, kind: Kind): Promise<string> {
  const db = getDb();
  const token = crypto.randomBytes(32).toString("base64url");
  // Only the newest link of each kind works.
  await db
    .update(emailTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(emailTokens.userId, user.id), eq(emailTokens.kind, kind), isNull(emailTokens.usedAt)));
  await db.insert(emailTokens).values({
    userId: user.id,
    kind,
    tokenHash: hashToken(token),
    email: user.email,
    expiresAt: new Date(Date.now() + (kind === "verify" ? VERIFY_TTL_MS : RESET_TTL_MS)),
  });
  return token;
}

export async function sendVerification(mailer: Mailer, req: Request, user: User): Promise<void> {
  const token = await issueToken(user, "verify");
  // After "#": browsers never send it to a server, so it stays out of request logs.
  const url = `${appUrl(req)}/verify-email#token=${token}`;
  await mailer.send({
    to: user.email,
    subject: "Confirm your email for GawainBook",
    ...renderEmail({
      greeting: `Hi ${user.username},`,
      lines: ["Welcome to GawainBook! Please confirm this is your email address, so you can always get back into your account."],
      button: "Confirm my email",
      url,
      footer: "The link works for 48 hours. If you didn't sign up, you can ignore this email.",
    }),
  });
}

async function sendReset(mailer: Mailer, req: Request, user: User): Promise<void> {
  const token = await issueToken(user, "reset");
  const url = `${appUrl(req)}/reset-password#token=${token}`;
  await mailer.send({
    to: user.email,
    subject: "Reset your GawainBook password",
    ...renderEmail({
      greeting: `Hi ${user.username},`,
      lines: ["Someone (hopefully you) asked to reset your GawainBook password."],
      button: "Choose a new password",
      url,
      footer: "The link works for 1 hour and only once. If you didn't ask for this, ignore this email: your password stays the same.",
    }),
  });
}

// Finds a usable token of the given kind, or throws a clear 400.
async function useToken(raw: unknown, kind: Kind) {
  const token = String(raw ?? "");
  if (!/^[\w-]{20,100}$/.test(token)) throw new HttpError(400, "This link isn't valid. Ask for a new one.");
  const db = getDb();
  const [row] = await db.select().from(emailTokens).where(and(eq(emailTokens.tokenHash, hashToken(token)), eq(emailTokens.kind, kind)));
  if (!row) throw new HttpError(400, "This link isn't valid. Ask for a new one.");
  if (row.usedAt) throw new HttpError(400, "This link has already been used. Ask for a new one.");
  if (row.expiresAt <= new Date()) throw new HttpError(400, "This link has expired. Ask for a new one.");
  // Claim it atomically so it can't be used twice in parallel.
  const claimed = await db
    .update(emailTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(emailTokens.id, row.id), isNull(emailTokens.usedAt)))
    .returning({ id: emailTokens.id });
  if (claimed.length === 0) throw new HttpError(400, "This link has already been used. Ask for a new one.");
  const [user] = await db.select().from(users).where(eq(users.id, row.userId));
  if (!user) throw new HttpError(400, "This link isn't valid. Ask for a new one.");
  return { row, user };
}

const FORGOT_MESSAGE = "If an account uses that email, we've sent a link to reset the password. Check your inbox (and spam folder).";

export function accountRouter(mailer: Mailer, limitAuth: RequestHandler, throttle?: LoginThrottle) {
  const router = Router();

  // Always the same answer, so it can't be used to find out who has an account.
  router.post(
    "/auth/forgot-password",
    limitAuth,
    handle(async (req, res) => {
      const email = normalizeEmail(req.body.email);
      if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new HttpError(400, "Please enter a valid email address.");
      const [user] = await getDb().select().from(users).where(eq(users.email, email));
      if (user && !user.suspendedAt && !(await recentlySent(user.id, "reset"))) {
        try {
          await sendReset(mailer, req, user);
        } catch (err) {
          console.error("Reset email failed:", err);
        }
      }
      res.json({ message: FORGOT_MESSAGE });
    })
  );

  router.post(
    "/auth/reset-password",
    limitAuth,
    handle(async (req, res) => {
      const password = checkNewPassword(req.body.password);
      const { user } = await useToken(req.body.token, "reset");
      if (user.suspendedAt) throw new HttpError(403, "This account has been suspended.");
      const db = getDb();
      const [updated] = await db
        .update(users)
        .set({
          passwordHash: await bcrypt.hash(password, 10),
          // Opening the link proves you own the inbox.
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id))
        .returning();
      // Sign out everywhere (whoever had the old password), then sign in here.
      await endAllSessions(user.id);
      throttle?.clear(user.email); // a reset unlocks sign-in straight away
      await startSession(res, user.id);
      res.json(await ownAccount(db, updated));
    })
  );

  // Works signed in or out (the link may be opened on another device).
  router.post(
    "/auth/verify-email",
    handle(async (req, res) => {
      const { row, user } = await useToken(req.body.token, "verify");
      if (row.email !== user.email) throw new HttpError(400, "This link was for a different email address.");
      await getDb().update(users).set({ emailVerifiedAt: user.emailVerifiedAt ?? new Date() }).where(eq(users.id, user.id));
      res.json({ verified: true });
    })
  );

  router.post(
    "/auth/resend-verification",
    requireAuth,
    limitAuth,
    handle(async (req, res) => {
      const user = req.user!;
      if (user.emailVerifiedAt) throw new HttpError(409, "Your email is already confirmed.");
      if (await recentlySent(user.id, "verify")) throw new HttpError(429, "We just sent one. Please wait a minute before asking again.");
      try {
        await sendVerification(mailer, req, user);
      } catch (err) {
        console.error("Verification email failed:", err);
        throw new HttpError(502, "We couldn't send the email just now. Please try again later.");
      }
      res.json({ sent: true });
    })
  );

  // Change your password: needs the current one.
  router.put(
    "/account/password",
    requireAuth,
    limitAuth,
    handle(async (req, res) => {
      const user = req.user!;
      const ok = await bcrypt.compare(String(req.body.currentPassword ?? ""), user.passwordHash);
      if (!ok) throw new HttpError(400, "Your current password isn't right.");
      const password = checkNewPassword(req.body.newPassword);
      await getDb().update(users).set({ passwordHash: await bcrypt.hash(password, 10), updatedAt: new Date() }).where(eq(users.id, user.id));
      await endAllSessions(user.id);
      await startSession(res, user.id);
      res.json({ changed: true });
    })
  );

  // GDPR Art. 15/20: everything we hold about you, as JSON.
  router.get(
    "/account/export",
    requireAuth,
    handle(async (req, res) => {
      const db = getDb();
      const me = req.user!;
      const [myPosts, likes, following, followers, shelf, memberships, myThreads, myComments, myBlocks, myReports, myNotifications] = await Promise.all([
        db.select().from(posts).where(eq(posts.userId, me.id)).orderBy(desc(posts.createdAt)),
        db.select({ postId: postLikes.postId, createdAt: postLikes.createdAt }).from(postLikes).where(eq(postLikes.userId, me.id)),
        db.select({ username: users.username, since: follows.createdAt }).from(follows).innerJoin(users, eq(users.id, follows.followingId)).where(eq(follows.followerId, me.id)),
        db.select({ username: users.username, since: follows.createdAt }).from(follows).innerJoin(users, eq(users.id, follows.followerId)).where(eq(follows.followingId, me.id)),
        db.select({ book: books.title, shelf: userBooks.shelf, chapter: userBooks.chapterSeq, updatedAt: userBooks.updatedAt }).from(userBooks).innerJoin(books, eq(books.id, userBooks.bookId)).where(eq(userBooks.userId, me.id)),
        db.select({ circle: circles.name, role: circleMembers.role, joinedAt: circleMembers.joinedAt }).from(circleMembers).innerJoin(circles, eq(circles.id, circleMembers.circleId)).where(eq(circleMembers.userId, me.id)),
        db.select({ id: threads.id, circleId: threads.circleId, chapter: threads.chapterSeq, title: threads.title, body: threads.body, createdAt: threads.createdAt, editedAt: threads.editedAt }).from(threads).where(eq(threads.authorId, me.id)),
        db.select({ id: comments.id, threadId: comments.threadId, body: comments.body, createdAt: comments.createdAt, editedAt: comments.editedAt }).from(comments).where(eq(comments.authorId, me.id)),
        db.select({ username: users.username, since: blocks.createdAt }).from(blocks).innerJoin(users, eq(users.id, blocks.blockedId)).where(eq(blocks.blockerId, me.id)),
        db.select({ targetType: reports.targetType, reason: reports.reason, details: reports.details, status: reports.status, createdAt: reports.createdAt }).from(reports).where(eq(reports.reporterId, me.id)),
        db.select({ type: notifications.type, threadId: notifications.threadId, readAt: notifications.readAt, createdAt: notifications.createdAt }).from(notifications).where(eq(notifications.userId, me.id)),
      ]);
      const account = {
        username: me.username,
        email: me.email,
        emailVerifiedAt: me.emailVerifiedAt,
        createdAt: me.createdAt,
        bio: me.bio,
        city: me.city,
        from: me.hometown,
        profilePicture: me.profilePicture,
        coverPicture: me.coverPicture,
        favoriteGenres: me.favoriteGenres,
        readingLanguage: me.readingLanguage,
        pace: me.pace,
        termsAcceptedAt: me.termsAcceptedAt,
        termsVersion: me.termsVersion,
      };
      const date = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Disposition", `attachment; filename="gawainbook-${me.username}-${date}.json"`);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        exportedAt: new Date().toISOString(),
        note: "Everything GawainBook stores about your account. Your password is stored only as a one-way hash and isn't included.",
        account,
        posts: myPosts.map((p) => ({ id: p.id, text: p.description, image: p.imageKey, createdAt: p.createdAt })),
        likes,
        following,
        followers,
        shelves: shelf,
        circles: memberships,
        discussions: myThreads,
        replies: myComments,
        blocked: myBlocks,
        reportsYouMade: myReports,
        notifications: myNotifications,
      });
    })
  );

  // Delete your account. Needs your password, so a borrowed laptop can't do it.
  router.delete(
    "/account",
    requireAuth,
    limitAuth,
    handle(async (req, res) => {
      const user = req.user!;
      const ok = await bcrypt.compare(String(req.body.password ?? ""), user.passwordHash);
      if (!ok) throw new HttpError(400, "That password isn't right.");
      const db = getDb();
      // Circles you own and still have other members: hand them on first.
      const owned = await db.select({ id: circles.id }).from(circles).where(eq(circles.ownerId, user.id));
      for (const { id } of owned) {
        const [heir] = await db
          .select({ userId: circleMembers.userId })
          .from(circleMembers)
          .where(and(eq(circleMembers.circleId, id), or(eq(circleMembers.role, "moderator"), eq(circleMembers.role, "member"))))
          .orderBy(desc(eq(circleMembers.role, "moderator")), circleMembers.joinedAt)
          .limit(1);
        if (heir) {
          await db.update(circles).set({ ownerId: heir.userId }).where(eq(circles.id, id));
          await db.update(circleMembers).set({ role: "owner" }).where(and(eq(circleMembers.circleId, id), eq(circleMembers.userId, heir.userId)));
        }
      }
      await endSession(req, res);
      // Everything else goes with ON DELETE CASCADE (empty circles too).
      await db.delete(users).where(eq(users.id, user.id));
      res.json({ deleted: true });
    })
  );

  return router;
}
