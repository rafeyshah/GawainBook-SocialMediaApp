// Runs in each test file: connect to the test database, empty every table
// between tests, and never use Neon object storage (tests use disk).
import { sql } from "drizzle-orm";
import { closeDb, getDb, initDb } from "../src/db/client";

process.env.NODE_ENV = "test";
for (const key of ["AWS_ENDPOINT_URL_S3", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) delete process.env[key];

beforeAll(() => {
  initDb(process.env.DATABASE_URL);
});

afterEach(async () => {
  await getDb().execute(
    sql`truncate table comments, threads, circle_members, circles, user_books, chapters, books, sessions, waitlist_entries, post_likes, follows, posts, users restart identity cascade`
  );
});

afterAll(async () => {
  await closeDb();
});

// Expected server errors are logged by the app; keep test output clean.
jest.spyOn(console, "error").mockImplementation(() => {});
