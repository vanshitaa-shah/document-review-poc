# Phase 05 — Concurrency & race test

**Day 7** · Depends on: 04

> The single most-checked item in the spec. This phase does not get cut or shortened.

## Goal
Prove the version integrity built in phases 03–04 actually holds when a revision upload
and an approval land at the same instant.

## Tasks

**The race test**
- Set up: a document with a current version, submitted, with a pending review
- Fire both at once with `Promise.all`:
  - a revision upload
  - an approval against the version that is current *at the moment the test starts*
- Run against real Postgres, not mocks — this bug class does not reproduce on mocks
- Loop it ~50 times; a race that passes once proves nothing

**Assertions after every iteration**
- Exactly one of the two operations succeeded
- `SELECT count(*) FROM document_versions WHERE document_id = ? AND is_current = true`
  is always exactly 1
- No `Approval` row points at a version where `isCurrent = false`
- The outcome is one of two known-good shapes, never a third

**Supporting tests**
- Stale version ID from a cached page → 409
- Two approvals fired simultaneously on the same version → one approval record, not two
- Category isolation: non-member requesting by exact ID → refused
- Locked document: mutation attempt on approved version → 409

**Tuning**
- Confirm the serialization retry wrapper from phase 03 behaves under real contention
- No 500s, no deadlock errors leaking to the client

## Done when
- The looped race test passes 50/50 runs
- The current-version count is never anything but 1
- No approval record ever attaches to a non-current version
- You can run the test live in a walkthrough and explain what it proves

## Not in this phase
- Load testing with 200 versions (optional stretch, out of scope)
