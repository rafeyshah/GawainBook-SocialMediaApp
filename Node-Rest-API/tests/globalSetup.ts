// Starts one throwaway PostgreSQL server for the whole test run and applies
// the real migrations, so tests exercise the same SQL, constraints and
// cascades as production. Nothing touches Neon.
import fs from "fs";
import os from "os";
import path from "path";
import net from "net";
// embedded-postgres is ESM-only; load it with a native import() that
// TypeScript's CommonJS output won't rewrite into require().
const importEsm = new Function("specifier", "return import(specifier)") as (s: string) => Promise<any>;
import { runMigrations } from "../src/db/client";

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });

export default async function globalSetup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gawainbook-pg-"));
  const port = await freePort();
  const { default: EmbeddedPostgres } = await importEsm("embedded-postgres");
  const pg = new EmbeddedPostgres({
    databaseDir: path.join(dir, "data"),
    user: "postgres",
    password: "postgres",
    port,
    persistent: false,
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("gawainbook_test");

  const url = `postgresql://postgres:postgres@localhost:${port}/gawainbook_test`;
  await runMigrations(url);

  process.env.DATABASE_URL = url;
  (globalThis as Record<string, unknown>).__PG__ = { pg, dir };
}
