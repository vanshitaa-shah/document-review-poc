# POC Scope: Document Review and Approval (12 days)

## Stack

**Backend**
- Node 22 + TypeScript
- Express 5
- PostgreSQL 16
- Prisma (migrations)
- Zod — request validation at the route boundary
- JWT (`jsonwebtoken`) + `bcrypt`
- `multer` → local `./uploads` folder, kept in a Docker named volume

**Frontend**
- React 19 + TypeScript, built with Vite
- Tailwind CSS
- `react-router`
- Native `fetch` in a small API client — no Redux, no React Query

**Inline commenting (Medium-style)**
- `@recogito/react-text-annotator` — text selection, highlight rendering, comment anchors
- `mammoth` — converts `.docx` to HTML so it can be highlighted
- `react-markdown` — renders `.md`
- `.txt` renders as-is; `.pdf` gets version-level comments only, no highlighting

**Logging**
- `pino` — structured JSON logs from the app
- **OpenObserve** — one container, free, self-hosted, log search UI
  (chosen over SigNoz and Grafana LGTM: same idea, but those need ClickHouse or 4+ containers)
- The **audit trail is a Postgres table**, not log lines. Logs are for debugging; the audit
  table is the proof a client asks for.

**Testing / Infra**
- Vitest + Supertest for API tests, against real Postgres
- Mocked E2E happy path
- Docker Compose: api + postgres + openobserve
- `.env.example` committed

---

## In scope

**Versioning core — the priority**
- Document → many Versions, one marked current
- Single-current enforced by a **Postgres partial unique index**, not just app code
- Revision upload = one SERIALIZABLE transaction: demote old → insert new → cancel pending
  reviews on the old → write audit rows
- Approval uses a conditional write (`WHERE version_id = ? AND is_current = true`) — a stale
  version ID is rejected at the query
- **Full copies per version**, not diffs

**Concurrency policy**
- A revision upload **auto-cancels in-flight reviews** on the superseded version
- A reviewer acting on a superseded version gets `409`
- A cancelled review can never produce an approval record

**Workflow**
- Author uploads: file + title + category → submits for review → uploads revisions
- Document becomes visible to reviewers who have access to that category
- Uploads limited to `.txt`, `.pdf`, `.md`, `.docx`, max 10 MB — rejected at the boundary
- Reviewer: approve, or request changes with a required comment
- One approval finishes it
- Approved version is locked — mutations return `409`, new content needs a new revision
- Download approved version + its approval record

**Inline comments**
- Reviewer selects a word, line or passage and comments on it
- Author and reviewer both see the highlight and the comment against that exact text
- Anchors stored as quote + character offsets, tied to **one specific version**
- Comments **stay on the version they were made on** — a new version starts clean, and the
  old version's comments remain visible in history
- `.txt`, `.md`, `.docx` support highlighting; `.pdf` gets version-level comments only

**Access control**
- Category ↔ User membership; a user has one role and can belong to many categories
- Filtered **in the query predicate**, not a post-fetch check
- Direct request by document ID without membership → refused
- Proven by test

**Audit trail**
- Table: actor, action, document, version, timestamp, metadata
- Written in the same transaction as the action
- Covers upload, submit, approve, request-changes, supersede, review-cancelled

**Pagination**
- Cursor-based on version history and document lists, with composite indexes

**UI (basic, Tailwind, no polish)**
- Login
- Document list, filtered by your categories, paginated
- Document detail: rendered document + version history table
- Author: upload, upload revision, submit
- Reviewer: approve, request changes, select text and comment
- Approved view: download + approval record
- Server errors shown verbatim — the `409` must be visible in the walkthrough

**Tests**
- **Race test**: revision upload + approval fired together, looped ~50×. Assert one winner,
  current pointer intact, no approval on a non-current version
- Category isolation test
- Stale-version approval rejection test
- Locked-document mutation test
- Mocked E2E happy path

---

## Not in v1

- Signup, refresh tokens, password reset — users come from a seed
- Admin UI for users and categories — seed script only
- Cloudinary / S3 / MinIO — the Docker volume persists, so it isn't needed
- Diff-based version storage
- PDF inline highlighting (pdf.js text layer)
- Re-anchoring comments onto a new version
- Comment replies, threads, mentions, resolve/unresolve
- Multiple required reviewers, quorum, size/category thresholds
- Notifications, email, webhooks
- Document preview for PDF beyond download, text extraction, search
- Soft delete, archival, retention
- Rate limiting, CORS hardening, prod security posture
- Metrics and tracing — logs only
- CI/CD, deployment beyond `docker compose up`
- No component library, no dark mode, no mobile layout, no frontend unit tests

---

## Confirmed decisions

- Express, not Next.js
- Seeded users, JWT login, no signup
- One role per user, many categories per user
- Files in a Docker named volume (persists across restarts and rebuilds; only
  `docker compose down -v` wipes it)
- File types: `.txt`, `.pdf`, `.md`, `.docx`
- One approval is sufficient
- Full copies per version, not diffs
- Revision upload cancels in-flight reviews
- Inline comments anchored per version, no carry-over
- Testing: API/integration + concurrency + mocked E2E happy path
- 12 days, not 10 — inline commenting is the reason

## Still to confirm

1. **Can an author approve their own document?** Assuming no.
2. **After a reviewer requests changes, what happens?** Assuming the document leaves the review
   queue and waits for the author to upload a new version.
3. **One repo or two?** Assuming one repo with `api/` and `web/` folders.
4. **Can an author comment too, or reviewers only?** Assuming reviewers comment, author replies
   are out of scope (no threads in v1).

---

## Day plan

| Days | Work |
|---|---|
| 1 | Scaffold, schema, seed, compose |
| 2 | Auth + category membership + authorization helper |
| 3 | Upload + submit for review, file type/size validation |
| 4–5 | **Versioning core** — supersession transaction, unique index, conditional approval |
| 6 | Review actions, locking, download + approval record |
| 7 | **Race test** + concurrency suite |
| 8 | Audit trail, pagination, indexes, pino + OpenObserve |
| 9 | UI: Vite + Tailwind, auth, login, document list |
| 10 | UI: document detail, version history, author/reviewer actions |
| 11 | Inline comments: render txt/md/docx, wire up recogito, store and replay anchors |
| 12 | Mocked E2E happy path, README, walkthrough rehearsal |

If day 7 or day 11 slips, inline commenting narrows to `.txt` and `.md` first. The race test
does not shrink — it's the single most-checked thing in the spec.

---

## Verification

- Clean clone + `.env` → `docker compose up` brings up API, UI and OpenObserve with migrations
  and seed applied. Test it by deleting volumes and images first.
- Confirm file persistence explicitly: upload, `docker compose restart`, download the same file.
- `npm test` — full suite against real Postgres, including the looped race test.
- Stale-approval demoed **through the UI**: reviewer opens a version, author uploads a revision
  in another window, reviewer clicks approve → visible `409`.
- Inline comments: highlight text on version 1, upload version 2, confirm version 2 is clean and
  version 1's comments are still there in history.
- Rehearse the three walkthrough questions in §7 of the spec.
