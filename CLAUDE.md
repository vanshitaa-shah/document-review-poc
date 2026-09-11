# Document Review and Approval — POC

A 12-day solo POC. Full scope in [SCOPE.md](SCOPE.md), split into phases in [phases/](phases/).

## What this project is graded on

Version integrity under concurrent activity. A revision arriving mid-review, or two
approvals landing at once, are real failures here even if the happy path demos perfectly.

Everything else in this codebase exists to support that. When trading off, the versioning
core and its concurrency tests win.

## Layout

```
api/          Express 5 + TypeScript + Prisma
web/          React 19 + Vite + Tailwind
phases/       The build plan, one file per phase
```

## Stack

Node 22, Express 5, PostgreSQL 16, Prisma, Zod, JWT, multer, pino + OpenObserve.
React 19, Vite, Tailwind, react-router, @recogito/react-text-annotator.
Vitest + Supertest against real Postgres.

## Non-negotiable invariants

These are the things that must never break. Details and the reasoning in
`.claude/skills/versioning-invariants/`.

1. **One current version per document**, enforced by a partial unique index in Postgres —
   not by application code.
2. **Approval is a single conditional write** (`WHERE ... AND is_current = true`).
   Never read the version, check `isCurrent` in JS, then write.
3. **Supersession is one SERIALIZABLE transaction** — demote, insert, cancel pending
   reviews, audit. All or nothing.
4. **Category access is a query predicate**, never a post-fetch check. The row must not load.
5. **Audit rows are written in the same transaction** as the action they record.

## Conventions

- Zod validates at the route boundary — bad input never reaches business logic
- Errors map to 400 / 401 / 403 / 404 / 409 through the central handler
- Cursor pagination, never offset
- Migrations, never `prisma db push`
- Serialization failures (`40001`) are retried, not surfaced as 500s

## Commands

- `/phase <n>` — start work on a phase
- `/check` — typecheck, lint, test
- `/race` — run the concurrency race test in a loop
- `/db-reset` — drop, migrate, seed
- `/invariants` — audit the codebase against the five invariants above
