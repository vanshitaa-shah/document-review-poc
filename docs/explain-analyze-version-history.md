# EXPLAIN ANALYZE — version history pagination

Phase 06 "done when": `EXPLAIN ANALYZE` output captured for version history, proving
the composite index is used and there is no table scan.

Setup: one document seeded with 500 `DocumentVersion` rows (`documentId`, `versionNumber`
1..500), matching the shape `GET /documents/:id/versions` queries against.

## First page (no cursor)

```sql
EXPLAIN ANALYZE
SELECT * FROM "DocumentVersion"
WHERE "documentId" = 'ab95d6a8-3645-4072-8bde-a9cb8347b0e9'
ORDER BY "versionNumber" DESC
LIMIT 21;
```

```
Limit  (cost=13.04..13.04 rows=3 width=245) (actual time=0.442..0.445 rows=21 loops=1)
  ->  Sort  (cost=13.04..13.04 rows=3 width=245) (actual time=0.440..0.442 rows=21 loops=1)
        Sort Key: "versionNumber" DESC
        Sort Method: top-N heapsort  Memory: 36kB
        ->  Bitmap Heap Scan on "DocumentVersion"  (actual time=0.131..0.306 rows=500 loops=1)
              Recheck Cond: ("documentId" = 'ab95d6a8-3645-4072-8bde-a9cb8347b0e9'::text)
              Heap Blocks: exact=15
              ->  Bitmap Index Scan on "DocumentVersion_documentId_versionNumber_key"
                    Index Cond: ("documentId" = 'ab95d6a8-3645-4072-8bde-a9cb8347b0e9'::text)
Planning Time: 1.070 ms
Execution Time: 0.531 ms
```

Uses the composite unique index on `(documentId, versionNumber)` — the same columns as
the explicit `@@index([documentId, versionNumber])` in the Prisma schema — via a bitmap
scan, then a small top-N sort for the LIMIT. No `Seq Scan` anywhere in the plan.

## Second page (with cursor — the actual pagination case)

```sql
EXPLAIN ANALYZE
SELECT * FROM "DocumentVersion"
WHERE "documentId" = 'ab95d6a8-3645-4072-8bde-a9cb8347b0e9'
  AND "versionNumber" < 480
ORDER BY "versionNumber" DESC
LIMIT 21;
```

```
Limit  (cost=0.27..5.45 rows=21 width=189) (actual time=0.022..0.026 rows=21 loops=1)
  ->  Index Scan Backward using "DocumentVersion_documentId_versionNumber_key"
        on "DocumentVersion"  (actual time=0.021..0.024 rows=21 loops=1)
        Index Cond: (("documentId" = '...') AND ("versionNumber" < 480))
Planning Time: 0.906 ms
Execution Time: 0.069 ms
```

With the cursor predicate applied (the actual shape `list-versions.ts` runs on page 2+),
Postgres does a single `Index Scan Backward` — no sort step needed at all, no bitmap
heap fetch, no table scan. Execution time is sub-millisecond at 500 versions.
