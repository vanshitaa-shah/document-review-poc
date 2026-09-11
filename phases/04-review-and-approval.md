# Phase 04 — Review, approval, locking

**Day 6** · Depends on: 03

## Goal
Reviewers act only on the current version. Approved documents are frozen.

## Tasks

**Review queue**
- `GET /reviews/queue` — SUBMITTED current versions in your categories only.
  Excludes drafts and anything already approved.

**Review actions**
- `POST /versions/:versionId/approve`
- `POST /versions/:versionId/request-changes` — comment is **required** (Zod)

**Stale-version guard — the enforcement to be able to point at**
- The approval writes with a conditional predicate:
  ```sql
  UPDATE ... WHERE id = :versionId AND is_current = true AND status = 'SUBMITTED'
  ```
- If zero rows are affected, return `409` naming the actual current version.
- This is one atomic statement. Do not read the version, check `isCurrent` in JS,
  and then write — that leaves a gap between the check and the write, which is
  exactly the bug this POC is looking for.
- Same guard on request-changes.

**On approval**
- Version status → APPROVED, create the `Approval` record (who, when, which version)
- All in one transaction with the audit row

**On request-changes**
- Version status → CHANGES_REQUESTED, document leaves the review queue,
  waits for the author's next revision

**Locking**
- Any mutating request against an APPROVED version returns `409`
- New content requires a new version — never a mutation of the approved one

**Download**
- `GET /versions/:id/download` — the file, plus its approval record
- Category access enforced here too

## Done when
- Approving the current version works and creates exactly one approval record
- Approving a superseded version returns 409 and creates nothing
- Request-changes without a comment returns 400
- Any edit attempt on an approved version returns 409
- Download returns the file and the approval record; a non-member is refused

## Not in this phase
- Multiple reviewers or quorum — one approval is sufficient
- Inline comments (phase 09)
