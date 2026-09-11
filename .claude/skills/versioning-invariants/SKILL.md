---
name: versioning-invariants
description: The five non-negotiable correctness rules for document versioning, approval, category access and audit. Load before writing or changing any code that touches DocumentVersion, Review, Approval, isCurrent, supersession, transactions, or category filtering — and before reviewing such code.
---

# Versioning invariants

This POC is graded on version integrity under concurrency. These five rules are the
difference between a demo that looks fine and a system that is actually correct.

Each one includes the wrong version, because the wrong version is the one that gets
written by accident and passes casual testing.

---

## 1. One current version per document — enforced by the database

```sql
CREATE UNIQUE INDEX one_current_version_per_document
  ON document_versions (document_id)
  WHERE is_current = true;
```

Application logic can have bugs. This index cannot be argued with. If the code is ever
wrong, the write fails loudly instead of corrupting state quietly.

**Never** rely on application code alone to maintain this. If you find yourself writing
"we always set the old one false first, so it's fine" — that reasoning is exactly what
breaks under two concurrent writers.

---

## 2. Approval is a single conditional write

**Wrong** — there is a gap between the check and the write. A revision landing in that
gap produces an approval on a superseded version. This is the bug the POC is looking for:

```ts
const version = await db.documentVersion.findUnique({ where: { id } })
if (!version.isCurrent) throw new ConflictError()
await db.approval.create({ data: { versionId: id, ... } })
```

**Right** — the condition and the write are one atomic statement:

```ts
const { count } = await tx.documentVersion.updateMany({
  where: { id: versionId, isCurrent: true, status: 'SUBMITTED' },
  data: { status: 'APPROVED' },
})
if (count === 0) {
  const current = await tx.documentVersion.findFirst({
    where: { documentId, isCurrent: true },
  })
  throw new ConflictError(`Version is no longer current. Current is v${current.versionNumber}.`)
}
await tx.approval.create({ data: { versionId, approvedBy, approvedAt: new Date() } })
```

The same applies to request-changes.

---

## 3. Supersession is one SERIALIZABLE transaction

Order matters, and all five steps live or die together:

1. Lock the current version
2. Old version → `isCurrent = false`, status SUPERSEDED
3. Insert new version → `isCurrent = true`, versionNumber + 1
4. Any PENDING review on the old version → SUPERSEDED
5. Audit rows for the supersession and the cancelled reviews

```ts
await db.$transaction(async (tx) => { /* steps 1-5 */ },
  { isolationLevel: 'Serializable' })
```

**Serialization failures are expected, not bugs.** Postgres will abort transactions under
contention with error code `40001`. Wrap in a retry helper (a few attempts, small backoff).
A `40001` reaching the client as a 500 is a defect.

Step 4 is the one people forget. Without it, a reviewer's pending review silently survives
onto a version it was never looking at.

---

## 4. Category access is a query predicate

**Wrong** — the row loaded. Even though the request is refused, the data was read, and
a logging or error path can leak it:

```ts
const doc = await db.document.findUnique({ where: { id } })
if (!userCategories.includes(doc.categoryId)) throw new ForbiddenError()
```

**Right** — the row never exists as far as this user is concerned:

```ts
const doc = await db.document.findFirst({
  where: { id, category: { memberships: { some: { userId } } } },
})
if (!doc) throw new NotFoundError()
```

Every document, version, comment, audit and download query goes through this. The spec
asks for it to be proven with a test, not a UI review.

---

## 5. Audit rows are written in the same transaction

If the action rolls back, its audit row must roll back with it. An audit trail that
drifts from actual state is worse than none — it will be confidently wrong.

```ts
await db.$transaction(async (tx) => {
  await tx.documentVersion.updateMany({ ... })
  await tx.approval.create({ ... })
  await tx.auditEvent.create({ ... })   // same tx, always
})
```

Never write audit rows from a middleware that runs after the response, or from a
`.then()` outside the transaction.

---

## Quick self-check

Before finishing any change in this area:

- Did I add a read-then-write where a conditional write belongs?
- Is every multi-step state change inside one transaction?
- Does every new query filter by category membership in the `where`?
- Does every new state-changing action write an audit row in the same transaction?
- Can two concurrent callers of this code path leave the database in a state the
  partial unique index would have rejected?
