/* Demo data for GawainBook (clearly labelled sample accounts).

   npm run seed:demo -- --member=rafeyrulz            # add demo data; include your account
   npm run seed:demo -- --member=a,b --password=xyz   # several accounts, fixed sample password
   npm run seed:demo -- --remove                      # delete all demo data

   The sample accounts' password comes from --password, SEED_PASSWORD, or is
   generated and printed once.
*/
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config({ path: path.join(__dirname, "../../../.env.local") });

import { closeDb, getDb, initDb, runMigrations } from "../db/client";
import { removeDemo, seedDemo } from "../seed/seed";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

async function main() {
  const { DATABASE_URL, DATABASE_URL_UNPOOLED } = process.env;
  if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");
  await runMigrations(DATABASE_URL_UNPOOLED || DATABASE_URL);
  initDb(DATABASE_URL);
  const db = getDb();

  if (process.argv.includes("--remove")) {
    const { sampleUsers } = await removeDemo(db);
    console.log(`Removed ${sampleUsers} sample accounts and their circles, discussions and posts.`);
    return;
  }

  const password = arg("password") || process.env.SEED_PASSWORD || crypto.randomBytes(9).toString("base64url");
  const members = (arg("member") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const s = await seedDemo(db, { password, members });
  console.log(
    `Seeded ${s.books} books, ${s.sampleUsers} sample accounts, ${s.circles} circles, ${s.threads} discussions, ${s.comments} replies, ${s.posts} posts, ${s.postComments} post comments.`
  );
  if (s.realMembers.length) console.log(`Added to the sample circles: ${s.realMembers.join(", ")}`);
  if (!arg("password") && !process.env.SEED_PASSWORD) {
    console.log(`Sample account password: ${password}   (e.g. sign in as elinor_reads@sample.gawainbook.invalid)`);
  }
}

main()
  .catch((err) => {
    console.error("Seeding failed:", err.message || err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
