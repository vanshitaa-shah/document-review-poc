---
description: Start work on a build phase
argument-hint: <phase number, e.g. 03>
---

Read `phases/$1-*.md` and start work on that phase.

Before writing code:
- Read the phase file fully, including its "Not in this phase" section
- Confirm the phases it depends on are actually done, not just started
- If the phase touches versioning, approval, transactions or category access,
  load the `versioning-invariants` skill first
- If it adds or changes an endpoint, load the `api-route-conventions` skill
- If it writes concurrency tests, load the `concurrency-testing` skill

Then work through the tasks in order. When you think you're finished, check every item
in the phase's "Done when" list and report which ones you actually verified versus
assumed. Do not mark the phase complete on assumption.

Stay inside the phase. Anything in "Not in this phase" belongs to a later one — note it
and move on rather than building it now.
