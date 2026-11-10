# D3: Adopt TypeScript incrementally

- **Status:** Accepted
- **Date:** 2026-11-10

## Context
The code is plain JavaScript (React 17 frontend, Express backend). Target roles ask for TypeScript, and the upcoming data model (circles, roles, progress, permissions) benefits from types that catch mistakes at compile time. A full rewrite would stop feature work for weeks.

## Options
1. **Stay on JavaScript.** No cost now; weaker safety and a weaker portfolio signal.
2. **Convert everything now.** Consistent, but weeks of work with no user-visible progress, and high risk of breaking working code.
3. **Incremental:** every *new* file is TypeScript; existing files are converted only when they're substantially changed.

## Decision
**Incremental adoption.** All new backend and frontend files are written in TypeScript (`.ts` / `.tsx`). Existing JavaScript files are converted when they're rewritten, not as a separate project. `strict` mode is on for new code.

## Why
- Matches the target role without pausing the roadmap.
- The new Postgres data layer (D4) is new code anyway, so its schema and queries are typed from day one.
- JavaScript and TypeScript can coexist (`allowJs`), so nothing has to change at once.

## Consequences
- The backend gains a build step (`tsc`) or a TypeScript runtime for development; CI adds a type-check job.
- The frontend's `react-scripts` 4 supports TypeScript; upgrading the toolchain (Vite) is a separate, later decision.
- Track progress informally: when most active code is TypeScript, convert the remainder in one sweep.
