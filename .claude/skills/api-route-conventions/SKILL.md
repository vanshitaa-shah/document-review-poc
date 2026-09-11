---
name: api-route-conventions
description: The standard shape of an Express route in this project — Zod validation, auth, category filtering, transaction, audit, error mapping, cursor pagination. Load before adding or modifying any API endpoint.
---

# API route conventions

Every route in this project follows the same order. The order is not cosmetic — it is
what keeps bad input away from business logic and keeps unauthorized rows unloaded.

## The order

1. **Zod** parses params, query and body. Invalid input never reaches the handler.
2. **Auth middleware** has already attached `req.user`. No route is anonymous.
3. **Role guard** if the action is author-only or reviewer-only.
4. **Query with the category predicate baked in** (see `versioning-invariants` rule 4).
5. **Transaction** for anything that changes more than one row.
6. **Audit row inside that transaction.**
7. **Throw a typed error**; the central handler maps it to a status code.

## Routes vs controllers vs schemas

- `routes/<resource>.ts` only wires `method, path, middleware chain, controller
  function` — no business logic. One comment line above each route saying what
  it's for.
- `controllers/<resource>/<action>.ts` — one handler per file (`request-changes.ts`,
  not a multi-export `reviews.controller.ts`). Add the new file to that resource's
  `controllers/<resource>/index.ts` barrel.
- `schemas/<resource>.schema.ts` — Zod schemas for that resource, imported by both
  the route (for `validate()`) and the controller (for `z.infer`).
- Before a second handler repeats the same few lines — an audit-row shape, a
  "file is required" check, a response reshape — pull it into `lib/` instead of
  copy-pasting. See `lib/audit.ts`, `lib/uploadedFile.ts`, `lib/documentResponse.ts`.

## Skeleton

```ts
// schemas/reviews.schema.ts
export const requestChangesBodySchema = z.object({
  comment: z.string().min(1, 'Comment is required'),
})
```

```ts
// controllers/reviews/request-changes.ts
export async function requestChanges(req: Request, res: Response) {
  const { versionId } = req.params
  const { comment } = req.body as z.infer<typeof requestChangesBodySchema>
  const { id: userId } = req.user!

  const result = await withSerializableRetry(() =>
    db.$transaction(async (tx) => {
      // category predicate in the where, not a check afterwards
      const version = await tx.documentVersion.findFirst({
        where: {
          id: versionId,
          isCurrent: true,
          status: 'SUBMITTED',
          document: { category: { memberships: { some: { userId } } } },
        },
      })
      if (!version) throw new ConflictError('Version is not the current submitted version')

      // ... state change, audit row (recordAuditEvent(tx, ...)), all in tx
    }, { isolationLevel: 'Serializable' })
  )

  res.json(result)
}
```

```ts
// routes/reviews.ts

// Reviewer requests changes on the current submitted version, with a required comment.
router.post(
  '/versions/:versionId/request-changes',
  requireAuth,
  requireRole('REVIEWER'),
  validate({ params: paramsSchema, body: requestChangesBodySchema }),
  requestChanges,
)
```

## Error mapping

| Error | Status | When |
|---|---|---|
| `ValidationError` | 400 | Zod failure, missing file, bad type or size |
| `UnauthorizedError` | 401 | No token, bad token |
| `ForbiddenError` | 403 | Authenticated but wrong role |
| `NotFoundError` | 404 | Doesn't exist, **or** no category access |
| `ConflictError` | 409 | Stale version, already approved, locked document |

404 for a category-access failure is deliberate — a 403 confirms the document exists,
which tells an unauthorized caller something.

The 409 message should name the actual current version. The UI renders it verbatim and
it appears in the walkthrough, so it needs to read like an explanation.

## Cursor pagination

Never offset — it degrades and skips rows when writes land mid-page.

```ts
const items = await db.documentVersion.findMany({
  where: { documentId, ...(cursor && { id: { lt: cursor } }) },
  orderBy: { id: 'desc' },
  take: limit + 1,
})
const hasMore = items.length > limit
return { items: items.slice(0, limit), nextCursor: hasMore ? items[limit - 1].id : null }
```

Composite indexes to match: `(document_id, id)`, `(category_id, id)`.

## File uploads

- multer to the `./uploads` volume, filename is a generated id — never the user's
- Allowed: `.txt`, `.pdf`, `.md`, `.docx`. Max 10 MB. Rejected at the boundary.
- Store sha256 and byte size on every version
- A request with no file is a 400 before any business logic runs
