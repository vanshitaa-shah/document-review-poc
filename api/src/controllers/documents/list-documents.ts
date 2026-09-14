import type { Request, Response } from 'express'
import { prisma } from '../../lib/prisma.js'
import { documentVisibilityFilter } from '../../lib/categoryAccess.js'
import { withCurrentVersion } from '../../lib/documentResponse.js'
import { decodeCursor, encodeCursor } from '../../lib/pagination.js'
import { getValidatedQuery } from '../../middleware/validate.js'
import { documentListQuerySchema } from '../../schemas/documents.schema.js'

// Lists documents visible to the caller (own drafts + everyone's submitted+),
// most-recently-changed first, cursor-paginated, optionally filtered by status
// (of the current version) and/or category.
export async function listDocuments(req: Request, res: Response) {
  const { cursor, limit = 20, status, categoryId } = getValidatedQuery(req, documentListQuerySchema)
  const { id: userId, role } = req.user!

  const cursorPage = cursor ? decodeCursor(cursor) : null

  const documents = await prisma.document.findMany({
    where: {
      AND: [
        documentVisibilityFilter(userId, role),
        ...(categoryId ? [{ categoryId }] : []),
        ...(status ? [{ versions: { some: { isCurrent: true, status } } }] : []),
        ...(cursorPage
          ? [
              {
                OR: [
                  { updatedAt: { lt: cursorPage.createdAt } },
                  { updatedAt: cursorPage.createdAt, id: { lt: cursorPage.id } },
                ],
              },
            ]
          : []),
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
