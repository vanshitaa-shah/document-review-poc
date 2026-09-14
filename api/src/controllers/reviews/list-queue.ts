import type { Request, Response } from 'express'
import { prisma } from '../../lib/prisma.js'
import { documentVersionCategoryFilter } from '../../lib/categoryAccess.js'
import { decodeCursor, encodeCursor } from '../../lib/pagination.js'
import { getValidatedQuery } from '../../middleware/validate.js'
import { queueQuerySchema } from '../../schemas/reviews.schema.js'

// Current, submitted versions in the reviewer's categories — never drafts, never decided.
export async function listReviewQueue(req: Request, res: Response) {
  const { cursor, limit = 20, categoryId } = getValidatedQuery(req, queueQuerySchema)
  const { id: userId } = req.user!

  const cursorPage = cursor ? decodeCursor(cursor) : null

  const versions = await prisma.documentVersion.findMany({
    where: {
      AND: [
        { isCurrent: true, status: 'SUBMITTED', ...documentVersionCategoryFilter(userId) },
        ...(categoryId ? [{ document: { categoryId } }] : []),
        ...(cursorPage
          ? [
              {
                OR: [
                  { uploadedAt: { lt: cursorPage.createdAt } },
                  { uploadedAt: cursorPage.createdAt, id: { lt: cursorPage.id } },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: {
      document: { include: { category: { select: { id: true, name: true } } } },
      uploadedBy: { select: { id: true, email: true } },
    },
  })

  const hasMore = versions.length > limit
  const page = versions.slice(0, limit)
  const last = page[page.length - 1]

  res.json({
    items: page,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.uploadedAt, id: last.id }) : null,
  })
}
