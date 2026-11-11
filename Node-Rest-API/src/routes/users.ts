import { Router } from "express";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { follows, users } from "../db/schema";
import { handle, HttpError, isId } from "../http";
import { publicProfile } from "../serializers";
import { endAllSessions, endSession, requireAuth } from "../auth";

const router = Router();
router.use(requireAuth);

const notFound = () => new HttpError(404, "User not found.");

// Profile and cover images: a key from /api/upload, or a bundled default
// image (public/images/person/...). Never an arbitrary URL or path.
export const PICTURE_KEY = /^(?:uploads\/[\w-]+|person\/[\w-]+)\.(?:png|jpe?g|gif|webp)$/i;

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

// Only the signed-in user's own account can be changed or deleted.
const ownAccountOnly = (id: string, me: string, action: string) => {
  if (id !== me) throw new HttpError(403, `You can only ${action} your own account.`);
};

router.put(
  "/:id",
  handle(async (req, res) => {
    const me = req.user!;
    ownAccountOnly(req.params.id, me.id, "update");

    const update: Record<string, unknown> = {};
    for (const [apiName, column] of Object.entries(EDITABLE)) {
      if (req.body[apiName] !== undefined) update[column] = req.body[apiName];
    }
    for (const pic of ["profilePicture", "coverPicture"]) {
      if (update[pic] !== undefined) {
        const v = update[pic] === null ? "" : String(update[pic]);
        if (v !== "" && !PICTURE_KEY.test(v)) throw new HttpError(400, "Please upload the image first.");
        update[pic] = v;
      }
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
    let passwordChanged = false;
    if (req.body.password !== undefined) {
      const pw = String(req.body.password);
      if (pw.length < 6 || pw.length > 72) throw new HttpError(400, "Password must be 6–72 characters.");
      update.passwordHash = await bcrypt.hash(pw, 10);
      passwordChanged = true;
    }

    const db = getDb();
    const [user] = await db
      .update(users)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(users.id, me.id))
      .returning();
    if (!user) throw notFound();
    // A new password signs out every other device.
    if (passwordChanged) await endAllSessions(me.id);
    res.json(await publicProfile(db, user));
  })
);

router.delete(
  "/:id",
  handle(async (req, res) => {
    ownAccountOnly(req.params.id, req.user!.id, "delete");
    await endSession(req, res);
    // Sessions, follows, posts and likes are removed by ON DELETE CASCADE.
    await getDb().delete(users).where(eq(users.id, req.user!.id));
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
    const meId = req.user!.id;
    if (meId === targetId) throw new HttpError(403, follow ? "You can't follow yourself." : "You can't unfollow yourself.");
    if (!(await findUser(targetId))) throw notFound();

    const db = getDb();
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
