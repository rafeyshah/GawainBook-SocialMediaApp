import path from "path";
import { Pool } from "pg";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

export const MIGRATIONS_FOLDER = path.join(__dirname, "../../drizzle");

// Neon URLs use sslmode=require. node-postgres currently treats that as
// verify-full but will weaken it in v9; pin the secure behaviour explicitly.
export const withVerifiedSsl = (url: string): string =>
  url.replace(/([?&])sslmode=(?:prefer|require|verify-ca)\b/, "$1sslmode=verify-full");

let pool: Pool | null = null;
let db: Db | null = null;
let lastError: string | null = null;

// One pool per process. Use Neon's pooled URL (DATABASE_URL) for app traffic.
export function initDb(connectionString: string | undefined): void {
  if (!connectionString) {
    lastError = "DATABASE_URL is not set";
    return;
  }
  pool = new Pool({ connectionString: withVerifiedSsl(connectionString), max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 15_000 });
  pool.on("error", (err) => {
    lastError = err.message;
    console.error("Postgres pool error:", err.message);
  });
  db = drizzle(pool, { schema });
  lastError = null;
}

export function getDb(): Db {
  if (!db) throw new Error(lastError || "Database is not initialised");
  return db;
}

// Migrations need a direct (unpooled) connection: PgBouncer's transaction
// mode breaks the session state migration tools rely on.
export async function runMigrations(directUrl: string): Promise<void> {
  const migrationPool = new Pool({ connectionString: withVerifiedSsl(directUrl), max: 1 });
  try {
    await migrate(drizzle(migrationPool), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await migrationPool.end();
  }
}

// For /api/health: a real round trip, never secrets.
export async function dbStatus(): Promise<{ db: "connected" | "disconnected"; error: string | null }> {
  if (!db) return { db: "disconnected", error: lastError || "Database is not initialised" };
  try {
    await db.execute(sql`select 1`);
    lastError = null;
    return { db: "connected", error: null };
  } catch (err) {
    lastError = (err as Error).message;
    return { db: "disconnected", error: lastError };
  }
}

export async function closeDb(): Promise<void> {
  if (pool) await pool.end();
  pool = null;
  db = null;
}
