# Decision log

Short records of the important technical and product decisions, written when each decision is made. Each file covers the context, the options considered, the choice and the reasons, so anyone (including future me in an interview) can see *why*, not just *what*.

**Status values:** *Accepted* (in force) · *Provisional* (in force, but revisit at the stated trigger) · *Superseded* (replaced; link to the replacement).

| # | Decision | Status | Date |
|---|---|---|---|
| [D1](0001-database-postgresql.md) | Database: PostgreSQL on Neon, with pgvector | Accepted | 2026-11-10 |
| [D2](0002-auth-session-cookies.md) | Auth: httpOnly session cookie + CSRF protection | Accepted, implemented | 2026-11-10 |
| [D3](0003-typescript-incremental.md) | TypeScript: all new files, convert old ones when touched | Accepted | 2026-11-10 |
| [D4](0004-data-access-drizzle.md) | Data access: Drizzle ORM + versioned migrations | Accepted | 2026-11-10 |
| [D5](0005-first-book.md) | First book: *Pride and Prejudice* | Accepted (source still to verify) | 2026-11-10 |
| [D6](0006-ai-provider-claude.md) | AI provider: Anthropic Claude only | Accepted | 2026-11-10 |
| [D7](0007-embeddings.md) | Embeddings: Voyage AI, reversible by design | Provisional | 2026-11-10 |
| [D8](0008-hosting.md) | Hosting: Render web service + Neon Postgres + Neon object storage | Accepted | 2026-11-10 |
| [D9](0009-demote-posts-feed.md) | Keep the posts feed, but circles become the home screen | Accepted | 2026-11-10 |

## Template

```markdown
# DN: Title

- **Status:** Accepted | Provisional | Superseded by DX
- **Date:** YYYY-MM-DD

## Context
What forces this decision? What's true today?

## Options
1. Option A: pros / cons
2. Option B: pros / cons

## Decision
The choice, in one or two sentences.

## Why
The reasons that tipped it.

## Consequences
What this commits us to, what gets harder, and when to revisit.
```
