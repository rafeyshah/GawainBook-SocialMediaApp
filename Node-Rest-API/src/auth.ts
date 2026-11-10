// Authentication (decision D2): an httpOnly session cookie backed by a
// `sessions` row, plus double-submit CSRF protection for state-changing
// requests. The user is always taken from the session, never the request body.
import crypto from "crypto";
import type { CookieOptions, NextFunction, Request, RequestHandler, Response } from "express";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb } from "./db/client";
import { sessions, User, users } from "./db/schema";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export const SESSION_COOKIE = "gb_session";
export const CSRF_COOKIE = "gb_csrf";
export const CSRF_HEADER = "x-csrf-token";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const hashToken = (token: string): string => crypto.createHash("sha256").update(token).digest("hex");
const newToken = (): string => crypto.randomBytes(32).toString("base64url");

// Secure cookies need HTTPS; on Render the app is always behind HTTPS.
const secure = (): boolean => process.env.NODE_ENV === "production";

export const sessionCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: secure(),
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_TTL_MS,
});

// Readable by the page's JavaScript on purpose: it must copy it into a header.
const csrfCookieOptions = (): CookieOptions => ({
  httpOnly: false,
  secure: secure(),
  sameSite: "lax",
  path: "/",
});

export async function startSession(res: Response, userId: string): Promise<void> {
  const db = getDb();
  const token = newToken();
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  // Opportunistic clean-up of this user's expired sessions.
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  // A fresh CSRF token on sign-in, so a token planted before login is useless.
  res.cookie(CSRF_COOKIE, newToken(), csrfCookieOptions());
}

export async function endSession(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string" && token) {
    await getDb().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  const { maxAge: _maxAge, ...clear } = sessionCookieOptions();
  res.clearCookie(SESSION_COOKIE, clear);
}

export async function endAllSessions(userId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.userId, userId));
}

export async function userFromRequest(req: Request): Promise<User | undefined> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return undefined;
  const [row] = await getDb()
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
  return row?.user;
}

// 401 unless the request carries a valid, unexpired session cookie.
export const requireAuth: RequestHandler = (req, res, next) => {
  userFromRequest(req)
    .then((user) => {
      if (!user) {
        res.status(401).json({ error: "Please sign in to continue." });
        return;
      }
      req.user = user;
      next();
    })
    .catch(next);
};

const sameToken = (a: string, b: string): boolean => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

// Double-submit CSRF: every response makes sure the browser has a csrf
// cookie; every state-changing /api request must echo it in a header.
// A cross-site page can't read our cookie, so it can't forge the header.
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  let token: unknown = req.cookies?.[CSRF_COOKIE];
  if (typeof token !== "string" || token.length < 20) {
    token = newToken();
    res.cookie(CSRF_COOKIE, token, csrfCookieOptions());
  }
  if (SAFE_METHODS.has(req.method) || !req.path.startsWith("/api/")) {
    next();
    return;
  }
  const header = req.get(CSRF_HEADER);
  const cookie = req.cookies?.[CSRF_COOKIE];
  if (typeof header !== "string" || typeof cookie !== "string" || !sameToken(header, cookie)) {
    res.status(403).json({ error: "Your session expired. Please refresh the page and try again." });
    return;
  }
  next();
}
