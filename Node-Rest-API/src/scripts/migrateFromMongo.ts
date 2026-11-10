/* One-off: copy users, follows, posts, likes and images from MongoDB to
   Postgres + object storage. Safe to re-run (existing rows are skipped).

   npm run migrate:mongo -- --dry-run   # show what would happen
   npm run migrate:mongo                # do it
*/
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config({ path: path.join(__dirname, "../../../.env.local") });

import mongoose from "mongoose";
import { closeDb, getDb, initDb, runMigrations } from "../db/client";
import { follows, postLikes, posts, users } from "../db/schema";
import { createStorage } from "../storage";
import { MongoPost, MongoUser, planMigration } from "../migration/transform";

const OLD_IMAGES = path.join(__dirname, "../../public/images");
const CONTENT_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { MONGO_URL, DATABASE_URL, DATABASE_URL_UNPOOLED } = process.env;
  if (!MONGO_URL) throw new Error("MONGO_URL is not set");
  if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

  await mongoose.connect(MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true } as mongoose.ConnectOptions);
  const mdb = mongoose.connection.db;
  const mongoUsers = (await mdb.collection("users").find().toArray()) as unknown as MongoUser[];
  const mongoPosts = (await mdb.collection("posts").find().toArray()) as unknown as MongoPost[];
  await mongoose.disconnect();

  const plan = planMigration(mongoUsers, mongoPosts, (f) => fs.existsSync(path.join(OLD_IMAGES, f)));
  console.log(
    `MongoDB: ${mongoUsers.length} users, ${mongoPosts.length} posts → ` +
      `${plan.users.length} users, ${plan.follows.length} follows, ${plan.posts.length} posts, ` +
      `${plan.likes.length} likes, ${plan.images.length} images`
  );
  plan.skipped.forEach((s) => console.log("  skipped:", s));
  if (dryRun) return;

  await runMigrations(DATABASE_URL_UNPOOLED || DATABASE_URL);
  initDb(DATABASE_URL);
  const db = getDb();
  const storage = createStorage();

  for (const img of plan.images) {
    const body = await fs.promises.readFile(path.join(OLD_IMAGES, img.source));
    await storage.put(img.key, body, CONTENT_TYPES[path.extname(img.source).toLowerCase()] || "application/octet-stream");
  }
  await db.transaction(async (tx) => {
    if (plan.users.length) await tx.insert(users).values(plan.users).onConflictDoNothing();
    if (plan.follows.length) await tx.insert(follows).values(plan.follows).onConflictDoNothing();
    if (plan.posts.length) await tx.insert(posts).values(plan.posts).onConflictDoNothing();
    if (plan.likes.length) await tx.insert(postLikes).values(plan.likes).onConflictDoNothing();
  });
  console.log(`Done. Images stored in ${storage.kind === "neon" ? "Neon object storage" : "local disk"}.`);
  await closeDb();
}

main().catch(async (err) => {
  console.error("Migration failed:", err.message || err);
  await closeDb().catch(() => {});
  process.exit(1);
});
