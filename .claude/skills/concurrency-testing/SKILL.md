---
name: concurrency-testing
description: How to write the race tests this POC is graded on — real Postgres, Promise.all, looped iterations, and the specific assertions that catch a wrong-version approval. Load before writing or changing any concurrency or race-condition test.
---

# Concurrency testing

The sharpest check in this POC: fire a revision upload and an in-flight approval at
almost the same instant, and prove the system never attaches an approval to the wrong
version and never leaves two versions marked current.

## Rules

**Real Postgres, never mocks.** This entire bug class lives in the database's concurrency
behaviour. A mocked test proves nothing here and is worse than no test, because it looks
like coverage.

**Loop it.** A race that passes once passes by luck. Run ~50 iterations. Flakiness is the
signal you are looking for, so a test that is "usually green" is a failing test.

**Fresh state each iteration.** Truncate and re-seed between runs, or every iteration
after the first is testing a different scenario than you think.

## Shape

```ts
it('never approves a superseded version', async () => {
  for (let i = 0; i < 50; i++) {
    const { documentId, versionId } = await seedSubmittedDocumentWithPendingReview()

    const [uploadResult, approveResult] = await Promise.allSettled([
      request(app).post(`/documents/${documentId}/versions`)
        .set(authorAuth).attach('file', fixture('v2.txt')),
      request(app).post(`/versions/${versionId}/approve`)
        .set(reviewerAuth),
    ])

    // 1. exactly one current version, always
    const currentCount = await db.documentVersion.count({
      where: { documentId, isCurrent: true },
    })
    expect(currentCount).toBe(1)

    // 2. no approval on a non-current version
    const badApprovals = await db.approval.findMany({
      where: { version: { isCurrent: false } },
    })
    expect(badApprovals).toHaveLength(0)

    // 3. the outcome is one of two known-good shapes, never a third
    expectOneOf(outcomeOf(uploadResult, approveResult), [
      'upload-won-approval-409',
      'approval-won-upload-succeeded-as-v2',
    ])

    // 4. no 500s — a serialization failure must not leak
    for (const r of [uploadResult, approveResult]) {
      if (r.status === 'fulfilled') expect(r.value.status).not.toBe(500)
    }

    await resetDb()
  }
})
```

## The assertions that matter

The count check and the bad-approval check are the two that actually catch the bug.
Asserting only that "one request succeeded" would pass even with a corrupted pointer.

Assertion 3 matters because a third outcome — both succeeded, or both failed — means
the transaction boundary is wrong even if the data happens to look fine this time.

## Other races worth covering

- **Two simultaneous approvals** on the same version → exactly one `Approval` row.
  A duplicate here means the conditional write is not actually conditional.
- **Stale version id from a cached page** → 409, and nothing written.
- **Revision upload during request-changes**, not just during approve.

## Serialization failures

Postgres aborts transactions under SERIALIZABLE contention with `40001`. That is correct
behaviour, not a bug. The retry helper absorbs it. What the test should assert is that
no `40001` ever reaches the client as a 500.

If retries are being exhausted regularly, the transaction is holding too much or doing
work it doesn't need to hold a lock for — shrink it rather than raising the retry count.
