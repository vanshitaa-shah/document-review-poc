import type { Request, Response } from 'express'
import { prisma } from '../../lib/prisma.js'
import { documentVisibilityFilter } from '../../lib/categoryAccess.js'
import { withCurrentVersion } from '../../lib/documentResponse.js'
import { decodeCursor, encodeCursor } from '../../lib/pagination.js'
import { getValidatedQuery } from '../../middleware/validate.js'
import { listQuerySchema } from '../../schemas/documents.schema.js'

// Lists documents visible to the caller (own drafts + everyone's submitted+), cursor-paginated.
export async function listDocuments(req: Request, res: Response) {
  const { cursor, limit = 20 } = getValidatedQuery(req, listQuerySchema)
  const { id: userId } = req.user!

  const cursorPage = cursor ? decodeCursor(cursor) : null

  const documents = await prisma.document.findMany({
    where: {
      AND: [
        documentVisibilityFilter(userId),
        ...(cursorPage
          ? [
              {
                OR: [
                  { createdAt: { lt: cursorPage.createdAt } },
                  { createdAt: cursorPage.createdAt, id: { lt: cursorPage.id } },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  })
}
