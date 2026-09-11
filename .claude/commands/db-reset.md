---
description: Drop, recreate, migrate and seed the database
---

```
cd api
npx prisma migrate reset --force
npx prisma db seed
```

This destroys all local data, which is fine for this POC — users and categories come
from the seed.

Afterwards, confirm the partial unique index survived the reset:

```
docker compose exec postgres psql -U postgres -d docreview -c "\d document_versions"
```

`one_current_version_per_document` must be listed. It is created by a raw SQL migration,
so a schema change that regenerates migrations can silently drop it — that index is the
backstop for the whole POC.
