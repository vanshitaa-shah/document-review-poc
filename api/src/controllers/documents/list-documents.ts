import type { Request, Response } from 'express'
import { prisma } from '../../lib/prisma.ts'
import { documentVisibilityFilter } from '../../lib/categoryAccess.ts'
import { withCurrentVersion } from '../../lib/documentResponse.ts'
import { decodeCursor, encodeCursor } from '../../lib/pagination.ts'
import { getValidatedQuery } from '../../middleware/validate.ts'
import { documentListQuerySchema } from '../../schemas/documents.schema.ts'

// Lists documents visible to the caller (own drafts + everyone's submitted+),
// most-recently-changed first, cursor-paginated, optionally filtered by status
// (of the current version) and/or category.
export async function listDocuments(req: Request, res: Response) {
  const { cursor, limit = 20, status, categoryId } = getValidatedQuery(req, documentListQuerySchema)
  const { id: userId, role } = req.user!

  const cursorPage = cursor ? decodeCursor(cursor) : null

  // Author sees only their own docs; anyone else sees non-draft docs in their categories.
  const isVisibleToCaller = documentVisibilityFilter(userId, role)

  // Optional narrow-down from the category filter dropdown.
  const matchesCategoryFilter = categoryId ? { categoryId } : null

  // Optional narrow-down from the status filter dropdown
  const matchesStatusFilter = status ? { versions: { some: { isCurrent: true, status } } } : null

  // Keyset pagination: strictly older than the cursor, or same instant but a lower id.
  const isAfterCursor = cursorPage
    ? {
        OR: [
          { updatedAt: { lt: cursorPage.createdAt } },
          { updatedAt: cursorPage.createdAt, id: { lt: cursorPage.id } },
        ],
      }
    : null

  const documents = await prisma.document.findMany({
    where: {
      AND: [
        isVisibleToCaller,
        ...(matchesCategoryFilter ? [matchesCategoryFilter] : []),
        ...(matchesStatusFilter ? [matchesStatusFilter] : []),
        ...(isAfterCursor ? [isAfterCursor] : []),
      ],
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: {
      versions: { where: { isCurrent: true } },
      category: { select: { id: true, name: true } },
    },
  })

  const hasMore = documents.length > limit
  const page = documents.slice(0, limit)
  const last = page[page.length - 1]

  res.json({
    items: page.map(withCurrentVersion),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.updatedAt, id: last.id }) : null,
  })
}
