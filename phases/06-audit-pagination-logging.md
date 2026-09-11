# Phase 06 — Audit, pagination, logging

**Day 8** · Depends on: 04

## Goal
Every action leaves a record a client could be shown, and lists don't load the world
into memory.

## Tasks

**Audit trail**
- `AuditEvent` rows written **in the same transaction** as the action they record.
  If the action rolls back, so does its audit row — no drift between state and history.
- Actions covered: DOCUMENT_UPLOADED, VERSION_UPLOADED, SUBMITTED, APPROVED,
  CHANGES_REQUESTED, VERSION_SUPERSEDED, REVIEW_CANCELLED
- Each row: actor, action, document, version, timestamp, metadata JSON
- `GET /documents/:id/audit` — the trail for one document, category-access enforced

**Pagination**
- Cursor-based (keyed on id), not offset — offset degrades and skips rows under writes
- Applied to: document list, version history, audit trail
- Composite indexes: `(document_id, id)`, `(category_id, id)`
- Verify with `EXPLAIN ANALYZE` that history for a many-version document uses the
  index and does not table-scan

**Logging**
- `pino` structured JSON to stdout, with a request id on every line
- Add `openobserve` to docker-compose (one container)
- Ship logs to it via OTLP
- Keep it to logs only — no metrics, no traces

## Done when
- Every action in the list above produces exactly one audit row
- A rolled-back action leaves no audit row
- All three list endpoints paginate by cursor
- `EXPLAIN ANALYZE` output captured for version history
- Logs are searchable in the OpenObserve UI

## Not in this phase
- Metrics and tracing
- Alerting
