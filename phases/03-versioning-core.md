# Phase 03 — Versioning core

**Days 4–5** · Depends on: 02

> This is the phase the POC is actually about. Take the full two days.

## Goal
Submitting a revision atomically replaces the current version. Uploading one only stores
a hidden draft, so the version under review stays visible to reviewers until then. There is never a moment
where two versions look current, and never a path where a review attaches to the wrong one.

## Tasks

**Database-level guarantee (do this first)**
- Partial unique index, written as a raw SQL migration:
  ```sql
  CREATE UNIQUE INDEX one_current_version_per_document
    ON document_versions (document_id)
    WHERE is_current = true;
  ```
- This is the real enforcement. Application logic can have bugs; this index cannot be
  argued with. If the code is ever wrong, the write fails instead of corrupting state.

**Revision upload — hidden draft**
- `POST /documents/:id/versions` — new file, same document
- Stored with `isCurrent = false`, status DRAFT, version number = max + 1; current
  version, its reviews and comments are untouched. An earlier pending draft is
  SUPERSEDED. If the current version is itself an unsubmitted draft, it is replaced.
- Second partial unique index `one_draft_per_document` (`WHERE status = 'DRAFT'`)
- Reviewers never see drafts (document, history, content, comments)

**Revision submit — one transaction**
- `POST /documents/:id/submit` with a pending draft runs a `SERIALIZABLE` transaction
  that does, in order:
  1. Load the current version and lock it
  2. Set old version `isCurrent = false`, status SUPERSEDED
  3. Promote the draft: `isCurrent = true`, status SUBMITTED
  4. Update any PENDING review on the old version to SUPERSEDED
  5. Write audit rows for the supersession and the cancelled reviews
- Retry wrapper for Postgres serialization failures (error code `40001`) — a few
  retries with a small backoff. Serializable *will* abort under contention; that's
  expected, not a bug, but it must not surface as a 500.

**Version history**
- `GET /documents/:id/versions` — every version with who uploaded it, when, status
- Full copies per version, not diffs — reconstructing version N is a file read

## Done when
- Uploading a revision leaves the current version untouched; submitting it makes the
  draft current and the old one SUPERSEDED
- A pending review on the old version becomes SUPERSEDED in the same transaction
- Deliberately trying to mark two versions current fails at the database
- Version history shows the full chain with correct statuses
- Serialization retries work — no 500s under contention

## Not in this phase
- The concurrent race test (phase 05 — build the mechanism first, prove it after)
- Approval logic (phase 04)
