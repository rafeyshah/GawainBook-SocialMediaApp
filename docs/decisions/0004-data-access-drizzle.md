# D4: Data access with Drizzle ORM and versioned migrations

- **Status:** Accepted
- **Date:** 2026-11-10

## Context
Moving to PostgreSQL (D1) needs a way to define tables, run migrations and query safely. Queries must be parameterized (no SQL injection), migrations must live in version control, and results should be typed (D3). The access rule from Phase 1 (`chapter_seq <= progress`, membership, blocks) must be expressible as plain SQL so it can be applied inside list queries.

## Options
1. **Raw SQL with `pg`.** Full control and no abstraction, but no types, and migrations would need a separate tool.
2. **Prisma.** Mature, great tooling. But it uses its own schema language and a query engine binary, and complex `WHERE` clauses and pgvector need raw-SQL escape hatches.
3. **Drizzle ORM + drizzle-kit.** Schema written in TypeScript; SQL-like query builder; typed results; generated SQL migrations committed to git; pgvector column support; no extra engine binary; works with node-postgres and the Neon driver.

## Decision
Use **Drizzle ORM** with **drizzle-kit** migrations, over **node-postgres (`pg`)** for the long-running Express server.

## Why
- The schema is TypeScript, so types flow from the table definitions into every query.
- Queries stay close to SQL, which suits the permission rule and is easy to read in a code review.
- Migrations are plain SQL files in git, reviewable and repeatable in CI.
- Lightweight: no generated client or engine binary on Render.

## Consequences
- Migrations run as a build or release step (`drizzle-kit migrate`) before the new code starts.
- Use Neon's pooled connection string for the app; use the direct (unpooled) string for migrations.
- Revisit only if Drizzle can't express a needed query; raw `sql` fragments are the fallback.
