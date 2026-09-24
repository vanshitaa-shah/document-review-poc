# Document Review and Approval

Authors upload and submit documents, reviewers approve or request changes with inline
comments, and every version stays intact under concurrent activity. A 12-day solo POC.
Full scope in [SCOPE.md](SCOPE.md), build plan in [phases/](phases/), library notes in
[REFERENCE.md](REFERENCE.md).

## Setup

```bash
cp .env.example .env      # fill in JWT_SECRET and the Cloudinary keys
docker compose up -d --build
```

This starts Postgres and the API, runs migrations and seeds the database. The API and
web app are served at `http://localhost:3000`.

`.env` variables (full list in [.env.example](.env.example)):

- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT`: the database.
- `JWT_SECRET`: signs auth cookies. Generate with `openssl rand -base64 48`.
- `API_PORT`: the port the API and frontend listen on.
- `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`: where uploaded
  files are stored. The free tier needs no card. All three values are on the Console dashboard.

Seeded logins (password for all: `password123`):

| Email | Role | Category |
|---|---|---|
| `author1@example.com` to `author3@example.com` | AUTHOR | — |
| `reviewer1@example.com` to `reviewer3@example.com` | REVIEWER | Engineering |
| `reviewer4@example.com` to `reviewer7@example.com` | REVIEWER | Marketing |

## Tests

```bash
docker compose exec api npm test         # full suite, including the 50x race test
docker compose exec api npm run typecheck
```

Tests run against real Postgres. The race test runs in a loop because a single run can
pass by luck. See [concurrency-testing](.claude/skills/concurrency-testing/SKILL.md).

## Design decisions

**Full copies per version, not diffs.** Uploads are `.txt`, `.pdf`, `.md` or `.docx`,
and a text diff means nothing for the binary formats. Reading version N is one file read
with no diff chain to break. The extra storage is an accepted cost.

**Files in Cloudinary, not local disk.** Render's free tier has an ephemeral filesystem.
Files are buffered in memory (`lib/upload.ts`) and stored as raw Cloudinary assets
(`lib/storage.ts`) under random UUID keys. URLs are built server-side after the app's
auth and category checks and are never sent to the client.

**One current version, enforced by the database.**

```sql
CREATE UNIQUE INDEX one_current_version_per_document
  ON document_versions (document_id) WHERE is_current = true;
```

Approval is a single conditional write (`UPDATE ... WHERE id = ? AND isCurrent = true`),
never a read, check, then write. See
[versioning-invariants](.claude/skills/versioning-invariants/SKILL.md).

**Uploading a revision cancels in-flight reviews.** One `SERIALIZABLE` transaction
demotes the old version, inserts the new one, cancels pending reviews and writes audit
rows. If an approval lands after that transaction, the reviewer gets a `409` naming the
current version (`"Version is no longer current. Current is v3."`). If it lands before,
the approval stands.

**Comments are anchored per version.** Each comment stores a quote, context and offsets
against one `versionId`. A new version starts with no comments. Comments are not moved
onto new text, because guessing where they belong could put them in the wrong place.

**Category access is a query predicate.** Every query filters by category in the `WHERE`
clause, so a document a user can't access never loads. A request for one returns `404`,
not `403`, so it doesn't reveal that the document exists.

**Version history pagination** uses cursors over a `(documentId, versionNumber)` index.
The [EXPLAIN ANALYZE output](docs/explain-analyze-version-history.md) shows an
`Index Scan Backward` with no table scan, under a millisecond at 500 versions.

## Walkthrough

1. **Only the current version can be approved:** see the conditional update in
   `api/src/controllers/versions/approve-version.ts` and the partial unique index under
   `api/prisma/migrations/`.
2. **An approved document is locked:** `POST /documents/:id/versions` on an approved
   document returns `409`.
3. **Race demo:** run `docker compose exec api npm test -- test/race.test.ts`. Or open two
   browser windows, upload a revision as the author while the reviewer has the old
   version open, then approve as the reviewer. The `409` appears on screen.

## Layout

```
api/     Express 5 + TypeScript + Prisma
web/     React 19 + Vite + Tailwind
phases/  The build plan, one file per phase
docs/    EXPLAIN ANALYZE output
```

Code conventions inside `api/src/` are in [CLAUDE.md](CLAUDE.md).
