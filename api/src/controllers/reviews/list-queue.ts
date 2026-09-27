import type { Request, Response } from 'express'
import { prisma } from '../../lib/prisma.ts'
import { documentVersionCategoryFilter } from '../../lib/categoryAccess.ts'
import { decodeCursor, encodeCursor } from '../../lib/pagination.ts'
import { getValidatedQuery } from '../../middleware/validate.ts'
import { queueQuerySchema } from '../../schemas/reviews.schema.ts'

// Current, submitted versions in the reviewer's categories — never drafts, never decided.
export async function listReviewQueue(req: Request, res: Response) {
  const { cursor, limit = 20, categoryId } = getValidatedQuery(req, queueQuerySchema)
  const { id: userId } = req.user!

  const cursorPage = cursor ? decodeCursor(cursor) : null

  // Only current, submitted versions in the reviewer's own categories belong in the queue.
  const belongsInQueue = {
    isCurrent: true,
    status: 'SUBMITTED' as const,
    ...documentVersionCategoryFilter(userId),
  }

  // Optional narrow-down from the category filter dropdown.
  const matchesCategoryFilter = categoryId ? { document: { categoryId } } : null

  // Keyset pagination: strictly older than the cursor, or same instant but a lower id.
  const isAfterCursor = cursorPage
    ? {
        OR: [
          { uploadedAt: { lt: cursorPage.createdAt } },
          { uploadedAt: cursorPage.createdAt, id: { lt: cursorPage.id } },
        ],
      }
    : null

  const versions = await prisma.documentVersion.findMany({
    where: {
      AND: [
        belongsInQueue,
        ...(matchesCategoryFilter ? [matchesCategoryFilter] : []),
        ...(isAfterCursor ? [isAfterCursor] : []),
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
