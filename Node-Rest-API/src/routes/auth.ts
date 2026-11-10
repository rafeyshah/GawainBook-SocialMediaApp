import crypto from "crypto";
import { Router } from "express";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { handle, HttpError } from "../http";
import { ownAccount } from "../serializers";
import { endSession, requireAuth, startSession } from "../auth";

export const normalizeEmail = (email: unknown): string => String(email ?? "").trim().toLowerCase();

// A real bcrypt hash of a random string: comparing against it when the email
// doesn't exist keeps response times similar (no account enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 10);

export function authRouter(limit: { auth: import("express").RequestHandler }) {
  const router = Router();

  router.post(
    "/register",
    limit.auth,
    handle(async (req, res) => {
      const username = String(req.body.username ?? "").trim();
      const email = normalizeEmail(req.body.email);
      const password = String(req.body.password ?? "");

      if (username.length < 3 || username.length > 20) throw new HttpError(400, "Username must be 3–20 characters.");
      if (!/^[\w.-]+$/.test(username)) {
        throw new HttpError(400, "Usernames can use letters, numbers, dots, dashes and underscores.");
      }
      if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new HttpError(400, "Please enter a valid email address.");
      if (password.length < 6) throw new HttpError(400, "Password must be at least 6 characters.");
      if (password.length > 72) throw new HttpError(400, "Password must be at most 72 characters.");

      const db = getDb();
      const passwordHash = await bcrypt.hash(password, 10);
      // Unique constraints on username/email turn duplicates into 409s (see http.ts).
      const [user] = await db.insert(users).values({ username, email, passwordHash }).returning();
      await startSession(res, user.id);
      res.status(201).json(await ownAccount(db, user));
    })
  );

  router.post(
    "/login",
    limit.auth,
    handle(async (req, res) => {
      const db = getDb();
      const [user] = await db.select().from(users).where(eq(users.email, normalizeEmail(req.body.email)));
      const password = String(req.body.password ?? "");
      const valid = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
      // Same message for unknown email and wrong password.
      if (!user || !valid) throw new HttpError(401, "Incorrect email or password.");
      await startSession(res, user.id);
      res.status(200).json(await ownAccount(db, user));
    })
  );

  router.post(
    "/logout",
    handle(async (req, res) => {
      await endSession(req, res);
      res.status(204).end();
    })
  );

  // Who am I? The frontend calls this on load instead of trusting localStorage.
  router.get(
    "/me",
    requireAuth,
    handle(async (req, res) => {
      res.json(await ownAccount(getDb(), req.user!));
    })
  );

  return router;
}
