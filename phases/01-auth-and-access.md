# Phase 01 — Auth & category access

**Day 2** · Depends on: 00

## Goal
Every request is tied to a real user, and users only ever see their own categories.

## Tasks
- `POST /auth/login` — email + password, returns a JWT
- `bcrypt` for password hashing (seed script hashes properly, no plaintext)
- Auth middleware: verify JWT, attach user to the request, reject with 401 if missing
- Role guard helper — `requireRole('AUTHOR')`
- **Category access helper** — the important one. A single function every document
  query goes through, which adds the membership filter to the query itself.
  Not a check after fetching. The row must never load.
- Zod schemas for the login body, validated before the handler runs
- Central error handler mapping errors to 400 / 401 / 403 / 404 / 409

## Done when
- Login with correct credentials returns a token; wrong password returns 401
- Any protected route without a token returns 401
- A test proves a user requesting a document ID in a category they don't belong to
  is refused, and the SQL never returned the row

## Not in this phase
- Signup, refresh tokens, password reset
- Admin UI for users or categories
