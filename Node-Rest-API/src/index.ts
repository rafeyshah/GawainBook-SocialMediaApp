import path from "path";
import dotenv from "dotenv";

// Local env files: Node-Rest-API/.env, then the repo-root .env.local written
// by `neon env pull` / `neon deploy`. Real env vars (e.g. on Render) win.
dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env.local") });

import { closeDb, initDb, runMigrations } from "./db/client";
import { createApp } from "./app";
import { createStorage } from "./storage";

async function main() {
  const directUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (directUrl) {
    await runMigrations(directUrl);
    console.log("Database migrations applied");
  } else {
    console.error("DATABASE_URL is not set; the API will report 503 until it is.");
  }
  initDb(process.env.DATABASE_URL);

  const storage = createStorage();
  console.log(`Image storage: ${storage.kind === "neon" ? "Neon object storage" : "local disk"}`);

  const port = Number(process.env.PORT) || 8800;
  const server = createApp(storage).listen(port, () => console.log(`listening on localhost: ${port}`));

  const shutdown = () => server.close(() => closeDb().finally(() => process.exit(0)));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
