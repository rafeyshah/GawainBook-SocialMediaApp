/* A complete, throwaway GawainBook for end-to-end tests:
   a temporary PostgreSQL (embedded-postgres), the real migrations, the demo
   books and sample circles, local-disk image storage, and the built React app.

   npm run build && node dist/scripts/e2eServer.js        # http://localhost:8899
   E2E_PORT=9000 node dist/scripts/e2eServer.js

   Nothing touches Neon. Everything is deleted on exit. Development only:
   embedded-postgres is a dev dependency. */
import fs from "fs";
import os from "os";
import path from "path";
import net from "net";
import { closeDb, getDb, initDb, runMigrations } from "../db/client";
import express from "express";
import { eq } from "drizzle-orm";
import { createApp } from "../app";
import { MemoryMailer } from "../mailer";
import { users } from "../db/schema";
import { DiskStorage } from "../storage";
import { seedDemo } from "../seed/seed";

// embedded-postgres is ESM-only; a native import() that tsc won't rewrite.
const importEsm = new Function("specifier", "return import(specifier)") as (s: string) => Promise<any>;

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gawainbook-e2e-"));
  const { default: EmbeddedPostgres } = await importEsm("embedded-postgres");
  const pgPort = await freePort();
  const pg = new EmbeddedPostgres({
    databaseDir: path.join(dir, "data"),
    user: "postgres",
    password: "postgres",
    port: pgPort,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("gawainbook_e2e");
  const url = `postgresql://postgres:postgres@localhost:${pgPort}/gawainbook_e2e`;
  await runMigrations(url);
  initDb(url);
  const seeded = await seedDemo(getDb(), { password: process.env.SEED_PASSWORD || "sample-password", members: [] });
  console.log(`e2e: seeded ${seeded.books} books and ${seeded.circles} circles`);

  const port = Number(process.env.E2E_PORT) || 8899;
  // Emails are kept in memory so tests can open the links. These /__e2e
  // routes exist only in this throwaway server, never in the real app.
  const mailer = new MemoryMailer();
  const app = express();
  app.get("/__e2e/last-email", (req, res) => {
    const email = mailer.last(String(req.query.to || ""));
    res.json(email ? { subject: email.subject, link: mailer.linkIn(email) } : null);
  });
  app.post("/__e2e/make-admin/:username", async (req, res) => {
    await getDb().update(users).set({ isAdmin: true }).where(eq(users.username, req.params.username));
    res.json({ ok: true });
  });
  // Every test signs up and in from one address, so the brute-force limit
  // (tested on its own in tests/auth.test.ts) is raised here.
  const relaxed = { windowMs: 60_000, max: 1000 };
  app.use(createApp({ storage: new DiskStorage(path.join(dir, "uploads")), mailer, limits: { auth: relaxed, posting: relaxed } }));
  const server = app.listen(port, () => console.log(`e2e: GawainBook on http://localhost:${port}`));

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    server.close();
    await closeDb().catch(() => {});
    await pg.stop().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((err) => {
  console.error("e2e server failed:", err);
  process.exit(1);
});
