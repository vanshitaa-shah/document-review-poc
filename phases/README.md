# Phases

The scope in [../SCOPE.md](../SCOPE.md), split into 11 phases across 12 days.

| Phase | Name | Days | Depends on |
|---|---|---|---|
| [00](00-foundation.md) | Foundation & scaffold | 1 | — |
| [01](01-auth-and-access.md) | Auth & category access | 2 | 00 |
| [02](02-upload-and-submit.md) | Upload & submit for review | 3 | 01 |
| [03](03-versioning-core.md) | **Versioning core** | 4–5 | 02 |
| [04](04-review-and-approval.md) | Review, approval, locking | 6 | 03 |
| [05](05-concurrency-and-race-test.md) | **Concurrency & race test** | 7 | 04 |
| [06](06-audit-pagination-logging.md) | Audit, pagination, logging | 8 | 04 |
| [07](07-ui-foundation.md) | UI foundation | 9 | 06 |
| [08](08-ui-document-workflow.md) | UI document workflow | 10 | 07 |
| [09](09-inline-comments.md) | Inline comments | 11 | 08 |
| [10](10-hardening-and-demo.md) | Hardening & demo | 12 | all |
| [11](11-version-diff.md) | Version diff view | post-plan | 09 |

## Priority

Phases **03** and **05** are what this POC is graded on. Everything else exists to
support them. If time runs short, cut from 09 first, then 08 — never from 03 or 05.

## How to use these

Each file has: goal, tasks, done-when, and what it explicitly does not cover.
Work top to bottom. A phase isn't finished until its "Done when" list all passes.
