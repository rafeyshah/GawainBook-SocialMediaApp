import { Router } from "express";
import bcrypt from "bcrypt";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { follows, users } from "../db/schema";
import { handle, HttpError, isId } from "../http";
import { publicProfile } from "../serializers";

const router = Router();

const notFound = () => new HttpError(404, "User not found.");

async function findUser(id: unknown) {
  if (!isId(id)) return undefined;
  const [user] = await getDb().select().from(users).where(eq(users.id, id));
  return user;
}

// Profile fields a user may change on their own account (API name → column).
const EDITABLE = {
  desc: "bio",
  city: "city",
  from: "hometown",
  relationship: "relationship",
  profilePicture: "profilePicture",
  coverPicture: "coverPicture",
} as const;

router.put(
  "/:id",
  handle(async (req, res) => {
    if (req.body.userId !== req.params.id) throw new HttpError(403, "You can only update your own account.");
    if (!isId(req.params.id)) throw notFound();

    const update: Record<string, unknown> = {};
    for (const [apiName, column] of Object.entries(EDITABLE)) {
      if (req.body[apiName] !== undefined) update[column] = req.body[apiName];
    }
    if (update.relationship !== undefined && update.relationship !== null) {
      const r = Number(update.relationship);
      if (![1, 2, 3].includes(r)) throw new HttpError(400, "Relationship must be 1, 2 or 3.");
      update.relationship = r;
    }
    for (const text of ["bio", "city", "hometown"]) {
      if (typeof update[text] === "string" && (update[text] as string).length > 200) {
        throw new HttpError(400, "That text is too long (max 200 characters).");
      }
    }
    if (req.body.password !== undefined) {
      if (String(req.body.password).length < 6) throw new HttpError(400, "Password must be at least 6 characters.");
      update.passwordHash = await bcrypt.hash(String(req.body.password), 10);
    }

    const db = getDb();
    const [user] = await db
      .update(users)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(users.id, req.params.id))
      .returning();
    if (!user) throw notFound();
    res.json(await publicProfile(db, user));
  })
);

router.delete(
  "/:id",
  handle(async (req, res) => {
    if (req.body.userId !== req.params.id) throw new HttpError(403, "You can only delete your own account.");
    if (!isId(req.params.id)) throw notFound();
    // Follows, posts and likes are removed by ON DELETE CASCADE.
    const deleted = await getDb().delete(users).where(eq(users.id, req.params.id)).returning({ id: users.id });
    if (deleted.length === 0) throw notFound();
    res.json({ message: "Account deleted." });
  })
);

// GET /api/users?userId=… or ?username=…
router.get(
  "/",
  handle(async (req, res) => {
    const { userId, username } = req.query;
    const db = getDb();
    let user;
    if (userId) user = await findUser(userId);
    else if (typeof username === "string" && username) {
      [user] = await db.select().from(users).where(eq(users.username, username));
    }
    if (!user) throw notFound();
    res.json(await publicProfile(db, user));
  })
);

// The people a user follows.
router.get(
  "/friends/:userId",
  handle(async (req, res) => {
    const user = await findUser(req.params.userId);
    if (!user) throw notFound();
    const rows = await getDb()
      .select({ _id: users.id, username: users.username, profilePicture: users.profilePicture })
      .from(follows)
      .innerJoin(users, eq(users.id, follows.followingId))
      .where(eq(follows.followerId, user.id))
      .orderBy(users.username);
    res.json(rows);
  })
);

const followHandler = (follow: boolean) =>
  handle(async (req, res) => {
    const targetId = req.params.id;
    const meId = req.body.userId;
    if (!isId(meId)) throw new HttpError(400, "userId is required.");
    if (meId === targetId) throw new HttpError(403, follow ? "You can't follow yourself." : "You can't unfollow yourself.");
    if (!isId(targetId)) throw notFound();

    const db = getDb();
    const found = await db.select({ id: users.id }).from(users).where(inArray(users.id, [meId, targetId]));
    if (found.length !== 2) throw notFound();

    if (follow) {
      const inserted = await db
        .insert(follows)
        .values({ followerId: meId, followingId: targetId })
        .onConflictDoNothing()
        .returning({ id: follows.followerId });
      if (inserted.length === 0) throw new HttpError(409, "You already follow this reader.");
    } else {
      const removed = await db
        .delete(follows)
        .where(and(eq(follows.followerId, meId), eq(follows.followingId, targetId)))
        .returning({ id: follows.followerId });
      if (removed.length === 0) throw new HttpError(409, "You don't follow this reader.");
    }
    res.json({ following: follow });
  });

router.put("/:id/follow", followHandler(true));
router.put("/:id/unfollow", followHandler(false));

export default router;
