---
description: Audit the codebase against the five core invariants
---

Load the `versioning-invariants` skill, then audit the current codebase against all five
rules. This is a review, not a refactor — report first, fix only what I confirm.

For each rule, search the code and report findings with file:line:

1. **Single current version** — does the partial unique index exist in a migration?
   Has any later migration dropped or replaced it?
2. **Conditional approval write** — grep for read-then-write patterns: a `findUnique`
   or `findFirst` that reads a version, followed by an `isCurrent` check in JS, followed
   by a write. Every one of these is a bug.
3. **Supersession transaction** — is the revision upload one SERIALIZABLE transaction
   covering all five steps? Is step 4 (cancelling pending reviews) actually there?
4. **Category predicate** — find every query touching Document, DocumentVersion, Comment,
   AuditEvent or downloads. Any that lacks a membership filter in its `where` is a leak.
   Flag post-fetch checks separately — they are the subtler version of the same bug.
5. **Audit in-transaction** — find every `auditEvent.create`. Any outside the transaction
   of the action it records is drift waiting to happen.

Report as a table: rule, status, file:line, what's wrong. Be specific about which of
these you verified by reading code versus inferred.
