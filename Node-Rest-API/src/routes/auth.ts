import { Router } from "express";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { handle, HttpError } from "../http";
import { ownAccount } from "../serializers";

const router = Router();

export const normalizeEmail = (email: unknown): string => String(email ?? "").trim().toLowerCase();

router.post(
  "/register",
  handle(async (req, res) => {
    const username = String(req.body.username ?? "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password ?? "");

    if (username.length < 3 || username.length > 20) throw new HttpError(400, "Username must be 3–20 characters.");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Please enter a valid email address.");
    if (password.length < 6) throw new HttpError(400, "Password must be at least 6 characters.");

    const db = getDb();
    const passwordHash = await bcrypt.hash(password, 10);
    // Unique constraints on username/email turn duplicates into 409s (see http.ts).
    const [user] = await db.insert(users).values({ username, email, passwordHash }).returning();
    res.status(201).json(await ownAccount(db, user));
  })
);

router.post(
  "/login",
  handle(async (req, res) => {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.email, normalizeEmail(req.body.email)));
    // Same message for unknown email and wrong password (no account enumeration).
    const valid = user && (await bcrypt.compare(String(req.body.password ?? ""), user.passwordHash));
    if (!valid) throw new HttpError(401, "Incorrect email or password.");
    res.status(200).json(await ownAccount(db, user));
  })
);

export default router;
