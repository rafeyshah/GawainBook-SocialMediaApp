import crypto from "crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { handle, HttpError } from "../http";
import { ownAccount } from "../serializers";
import { endSession, requireAuth, startSession } from "../auth";
import { Mailer } from "../mailer";
import { TERMS_VERSION } from "../legal";
import { checkNewPassword, sendVerification } from "./account";

export const normalizeEmail = (email: unknown): string => String(email ?? "").trim().toLowerCase();

// A real bcrypt hash of a random string: comparing against it when the email
// doesn't exist keeps response times similar (no account enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 10);

export function authRouter(limit: { auth: import("express").RequestHandler }, mailer: Mailer) {
  const router = Router();

  router.post(
    "/register",
    limit.auth,
    handle(async (req, res) => {
      const username = String(req.body.username ?? "").trim();
      const email = normalizeEmail(req.body.email);
      const password = String(req.body.password ?? "");

      // Terms, privacy notice and minimum age (16 in Germany, GDPR Art. 8).
      if (req.body.acceptTerms !== true) throw new HttpError(400, "Please accept the terms and privacy notice to create an account.");
      if (req.body.confirmAge !== true) throw new HttpError(400, "You need to be at least 16 to use GawainBook.");
      if (username.length < 3 || username.length > 20) throw new HttpError(400, "Username must be 3–20 characters.");
      if (!/^[\w.-]+$/.test(username)) {
        throw new HttpError(400, "Usernames can use letters, numbers, dots, dashes and underscores.");
      }
      if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new HttpError(400, "Please enter a valid email address.");
      checkNewPassword(password);

      const db = getDb();
      const passwordHash = await bcrypt.hash(password, 10);
      // Unique constraints on username/email turn duplicates into 409s (see http.ts).
      const [user] = await db
        .insert(users)
        .values({ username, email, passwordHash, termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION })
        .returning();
      await startSession(res, user.id);
      // A failed email never blocks sign-up; you can ask again from Settings.
      await sendVerification(mailer, req, user).catch((err) => console.error("Verification email failed:", err));
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
      if (user.suspendedAt) throw new HttpError(403, "This account has been suspended. If you think this is a mistake, contact us via the Impressum.");
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
