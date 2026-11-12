/* Grant or revoke GawainBook admin rights (site-wide moderation).

   npm run admin -- --grant=<username>
   npm run admin -- --revoke=<username>
   npm run admin -- --list
*/
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config({ path: path.join(__dirname, "../../../.env.local") });

import { eq } from "drizzle-orm";
import { closeDb, getDb, initDb } from "../db/client";
import { users } from "../db/schema";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  initDb(process.env.DATABASE_URL);
  const db = getDb();
  if (process.argv.includes("--list")) {
    const admins = await db.select({ username: users.username }).from(users).where(eq(users.isAdmin, true));
    console.log(admins.length ? admins.map((a) => a.username).join("\n") : "No admins yet.");
    return;
  }
  const grant = arg("grant");
  const revoke = arg("revoke");
  const username = grant || revoke;
  if (!username) throw new Error("Use --grant=<username>, --revoke=<username> or --list");
  const done = await db.update(users).set({ isAdmin: Boolean(grant) }).where(eq(users.username, username)).returning({ id: users.id });
  if (done.length === 0) throw new Error(`No account called "${username}".`);
  console.log(`${username} is ${grant ? "now an admin" : "no longer an admin"}.`);
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
