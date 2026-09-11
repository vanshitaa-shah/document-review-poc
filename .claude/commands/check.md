---
description: Typecheck, lint and test the whole project
---

Run, from the repo root:

1. `cd api && npx tsc --noEmit`
2. `cd web && npx tsc --noEmit`
3. `cd api && npm test`

Report the actual output. If something fails, show the failure rather than summarising it,
then fix it. Do not report success unless all three passed.
