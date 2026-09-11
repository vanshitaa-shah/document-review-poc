---
description: Run the concurrency race test in a loop and report the result
---

Run the race test suite against real Postgres:

```
cd api && npm test -- concurrency
```

This is the most important test in the project, so:

- Confirm it actually ran the full loop, not a single iteration
- If it passes, run it twice more. A race test that passes once tells you very little.
- If it is flaky — green sometimes, red others — treat that as **failing**, not as a
  flaky test to retry. Flakiness here means the invariant genuinely does not hold.
- Report the number of iterations and the pass rate, not just "passed"

If it fails, load the `versioning-invariants` skill and check the failure against the
five rules before changing anything.
