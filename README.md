# Document Review and Approval

A document review workflow: authors upload and submit, reviewers approve or request
changes with inline comments, and every version is provably intact under concurrent
activity. Built as a 12-day solo POC — full scope in [SCOPE.md](SCOPE.md), the build
plan in [phases/](phases/), library-by-library rationale in [REFERENCE.md](REFERENCE.md).

## Setup

One command, from a clean clone:

```bash
cp .env.example .env
docker compose up -d --build
```

This brings up Postgres, the API, and OpenObserve; runs migrations; and seeds the
database. The API is on `http://localhost:3000`, the web app is served from the same
origin.

Seeded logins (all `password123`):

| Email | Role | Category |
|---|---|---|
| `author1@example.com`–`author3@example.com` | AUTHOR | — |
| `reviewer1@example.com`–`reviewer3@example.com` | REVIEWER | Engineering |
| `reviewer4@example.com`–`reviewer7@example.com` | REVIEWER | Marketing |

### What goes in `.env`

`.env` is git-ignored; `docker compose` reads it and substitutes into
`docker-compose.yml`. See [.env.example](.env.example) for the full list — the
short version:

- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` — database.
- `JWT_SECRET` — signs auth cookies. Generate with `openssl rand -base64 48`.
- `API_PORT` — where the API (and served frontend) listen.
- `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` — where app logs ship to. **Optional**: leave it
  unset and the app still logs JSON to stdout; nothing depends on OpenObserve being
  up. Set it to ship logs to the bundled OpenObserve container for search.
- `ZO_ROOT_USER_EMAIL` / `ZO_ROOT_USER_PASSWORD` / `OPENOBSERVE_PORT` — OpenObserve's
  own admin login, at `http://localhost:5080`.
- `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` —
  Cloudinary credentials for uploaded-file storage. Sign up at `cloudinary.com`
  (free tier, no card required) and copy all three from the Console dashboard's
  "API Environment variable" box.

### Running the tests

```bash
docker compose exec api npm test        # full suite, including the 50x race test
docker compose exec api npm run typecheck
```

Tests run against the same real Postgres the app uses — nothing here is mocked. See
[.claude/skills/concurrency-testing/SKILL.md](.claude/skills/concurrency-testing/SKILL.md)
for why the race test is looped instead of run once.

### File persistence

Uploaded files live in Cloudinary, not on the container's own disk (see
[Uploaded files live in object storage, not local disk](#uploaded-files-live-in-object-storage-not-local-disk)
below for why). `docker compose restart`, `docker compose down`, even `down -v`
— none of it touches Cloudinary; only the Postgres data (metadata: titles, versions,
reviews, audit rows) lives in the local volume and gets wiped by `-v`. Deleting the
Cloudinary asset directly would orphan a `DocumentVersion` row, but nothing in this
app does that.

## Design decisions

These are the calls this project is graded on. Each one is deliberate, not a default.

### Full copies per version, not diffs

Every `DocumentVersion` row points at its own complete, independent stored file (a
Cloudinary asset — see below). Uploaded files are `.txt`, `.pdf`, `.md`, `.docx` —
binary formats where a text diff is either
meaningless (`.pdf`, `.docx` are zipped/binary containers) or not something a
reviewer would ever read. Reconstructing version N is a single file read, not a
diff replay — no risk of a broken diff chain, and the storage cost (a full copy per
revision) is accepted deliberately over that complexity. See `phases/03-versioning-core.md`.

### Uploaded files live in object storage, not local disk

Originally a Docker named volume, matching the scope decision in `SCOPE.md` that a
local volume was enough for a 12-day POC. That held for local Docker Compose, but
broke on Render's free tier, whose container filesystem is ephemeral — a redeploy or
a sleep/wake cycle would silently lose every uploaded file. Since free hosting was a
hard requirement, uploads now go straight to a buffer in memory (`multer.memoryStorage()`,
see `lib/upload.ts`) and out to Cloudinary (`lib/storage.ts`) instead of a local path.
Cloudinary was picked specifically because its free tier needs no card on file —
S3-compatible options (R2, Backblaze B2) are otherwise a more natural fit for
arbitrary files, but R2 requires a card even to stay on the free tier. Uploaded
files aren't images, so they're stored as `resource_type: 'raw'` (an opaque blob,
no image processing). Each object's id is a fresh `randomUUID()` per file (see
`uploadedFile.ts`), so its Cloudinary URL is unguessable even though Cloudinary
itself doesn't enforce access control on it — this app's own auth and category
checks are still what actually gates a download; the URL is never handed to the
client directly, only built server-side per request (see `lib/storage.ts`).
The `DocumentVersion.filePath`
column is unchanged in shape — it just holds a Cloudinary object key now instead of
a local path, so no migration was needed.

### Single current version, enforced by the database

```sql
CREATE UNIQUE INDEX one_current_version_per_document
  ON document_versions (document_id)
  WHERE is_current = true;
```

Application code sets `isCurrent` during supersession, but the index — not the
code — is what actually guarantees only one row can ever be `true` at a time. If a
bug ever tried to leave two versions current, the write fails loudly instead of
corrupting state quietly. Approval itself is a single conditional write
(`UPDATE ... WHERE id = ? AND isCurrent = true`), never a read-then-check-then-write —
see `.claude/skills/versioning-invariants/SKILL.md` for the full reasoning and the
exact wrong-vs-right code shapes.

### Revision upload cancels in-flight reviews

Uploading a new version is one `SERIALIZABLE` transaction: demote the old version,
insert the new one, cancel any `PENDING` review on the old version, write audit rows
— all five steps commit together or not at all. This is what stops a reviewer from
clicking "approve" on a document the author has already changed out from under them.

**What the reviewer sees**: if their approval lands after the revision transaction
commits, the conditional write's `WHERE isCurrent = true` matches zero rows, and
they get a `409` naming the actual current version
(`"Version is no longer current. Current is v3."`) instead of a silent no-op or a
500. If their approval lands first, the revision upload proceeds normally and their
approval stands on the version they actually reviewed.

### Comments anchored per version, no carry-over

An inline comment stores a quote, surrounding context, and character offsets against
one specific `versionId` — never against the document. A new revision starts with
zero comments; the old version's comments stay exactly where they were made, visible
in that version's history. No re-anchoring, because re-anchoring a comment onto text
that may no longer exist is a guess, and a wrong guess is worse than an old comment
staying put.

### Category access as a query predicate

Every document, version, comment, and audit query filters by category membership
*inside* the `WHERE` clause — a document a user can't see never loads, so there's no
post-fetch check that could leak it through a logging or error path. A direct request
by ID for a document outside your categories returns `404`, not `403` — a `403` would
confirm the document exists.

### `EXPLAIN ANALYZE` — version history pagination

Full output in [docs/explain-analyze-version-history.md](docs/explain-analyze-version-history.md):
first page uses a bitmap scan on the composite `(documentId, versionNumber)` index,
and every page after that (the actual pagination case, with the cursor predicate
applied) is a single `Index Scan Backward` — sub-millisecond at 500 versions, no
table scan anywhere in either plan.

## Walkthrough

Three questions, answered by pointing at code rather than describing it:

1. **Only the current version can be approved — show me the enforcement.**
   The conditional `UPDATE ... WHERE id = ? AND isCurrent = true` in
   `api/src/controllers/versions/approve-version.ts`, backed by the partial unique
   index in the migration under `api/prisma/migrations/`.
2. **Full copies or diffs? What made you choose?**
   See [Full copies per version](#full-copies-per-version-not-diffs) above — binary
   files, O(1) reconstruction, storage cost accepted deliberately.
3. **An approved document is locked — show me an attempt to modify it.**
   `curl -X POST .../documents/:id/versions` against a document whose current version
   is `APPROVED` returns `409`.

Two live demos:

- `docker compose exec api npm test -- test/race.test.ts` — the looped race test;
  each assertion in it rules out a specific corruption (two current versions, an
  approval on a non-current version, a third outcome besides "upload won" or
  "approval won", a `40001` leaking to the client as a `500`).
- Two browser windows: reviewer opens a version, author uploads a revision in the
  other window, reviewer clicks approve — the `409` renders on screen, verbatim.

## Layout

```
api/          Express 5 + TypeScript + Prisma
web/          React 19 + Vite + Tailwind
phases/       The build plan, one file per phase
docs/         EXPLAIN ANALYZE output, OpenObserve verification notes
```

See [CLAUDE.md](CLAUDE.md) for the code layout conventions inside `api/src/`.
