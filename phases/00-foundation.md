# Phase 00 — Foundation & scaffold

**Day 1** · Depends on: nothing

## Goal
A repo that starts with one command, with the database schema in place.

## Tasks
- Create repo with `api/` and `web/` folders
- `api/`: TypeScript, Express 5, strict tsconfig, `tsx` for dev reload
- Install Prisma, point it at Postgres
- Write the schema:
  - `User` — email, password hash, role (AUTHOR | REVIEWER)
  - `Category` — name
  - `CategoryMembership` — user ↔ category (many-to-many)
  - `Document` — title, category, author, created at
  - `DocumentVersion` — document, version number, file path, file name, mime type,
    size, sha256, uploaded by, uploaded at, `isCurrent` boolean, status
  - `Review` — version, reviewer, status (PENDING | APPROVED | CHANGES_REQUESTED |
    SUPERSEDED), comment, decided at
  - `Approval` — version, approver, approved at
  - `Comment` — version, author, body, anchor fields (added properly in phase 09)
  - `AuditEvent` — actor, action, document, version, timestamp, metadata JSON
- First migration
- Seed script: 2 categories, 1 author, 2 reviewers, memberships
- `docker-compose.yml`: `api` + `postgres` (openobserve comes in phase 06)
- Postgres data and `./uploads` both on **named volumes**
- `.env.example` with every variable the app reads

## Done when
- `docker compose up` on a clean clone brings up api + postgres
- Migrations and seed run automatically on boot
- `GET /health` returns 200
- `docker compose down && docker compose up` keeps the seeded data

## Not in this phase
- Any real endpoint
- Auth
- The single-current index (phase 03 — it belongs with the logic it protects)
