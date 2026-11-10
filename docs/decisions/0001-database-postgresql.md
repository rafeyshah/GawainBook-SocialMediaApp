# D1: Move the database to PostgreSQL on Neon, with pgvector

- **Status:** Accepted
- **Date:** 2026-11-10

## Context
The app runs on MongoDB Atlas. The next features (reading circles, membership, invitations, chapter progress and spoiler rules) are relational: a thread is only readable if the reader is a *member* of the circle **and** their *progress* has reached the thread's *chapter*. Those rules need joins, foreign keys and uniqueness constraints that the database itself enforces. The AI assistant (Phase 2) will need vector search over book passages, filtered by the same permission data.

Production data is tiny today (a handful of users and posts), so a migration costs almost nothing now and much more later.

## Options
1. **Stay on MongoDB Atlas.** No migration work. But relations, constraints and permission joins all move into application code, and vectors would need Atlas Vector Search, a second query model.
2. **PostgreSQL on Neon + pgvector.** Real constraints and joins; vectors next to the permission data in one query; serverless with a free tier; database branching for previews and tests. Needs a migration.
3. **PostgreSQL on Supabase.** Similar database, but it bundles auth, storage and an API layer we don't plan to use, so the platform is larger than we need.

## Decision
Use **PostgreSQL on Neon** (project `polished-smoke-97142907`, branch `production`) with the **pgvector** extension. Retire MongoDB once data is migrated.

## Why
- The access rule (membership + progress + blocks) becomes one SQL `WHERE` clause, with foreign keys and unique constraints to back it up.
- Vectors and permissions live in the same database, so retrieval can filter by `chapter_seq <= progress` in a single query, before the AI sees anything.
- Neon branches give each test run or preview its own copy of the database.

## Consequences
- Rewrite the data layer (see [D4](0004-data-access-drizzle.md)) and write a one-off Mongo → Postgres migration script.
- While migrating, both databases run side by side behind a flag. **No new features are built on MongoDB**, not even "temporarily".
- Neon's free tier suspends idle compute; the first query after idle is slower. Acceptable through the alpha.
- Revisit if Neon pricing or limits block the alpha.
