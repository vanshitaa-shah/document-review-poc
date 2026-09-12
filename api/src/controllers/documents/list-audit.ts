import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { documentVisibilityFilter } from '../../lib/categoryAccess.js'
import { decodeCursor, encodeCursor } from '../../lib/pagination.js'
import { getValidatedQuery } from '../../middleware/validate.js'
import { NotFoundError } from '../../lib/errors.js'
import { listQuerySchema, paramsSchema } from '../../schemas/documents.schema.js'

// Full audit trail for one document, newest first, cursor-paginated, category access enforced.
export async function listAudit(req: Request, res: Response) {
  const { id: documentId } = req.params as z.infer<typeof paramsSchema>
  const { cursor, limit = 20 } = getValidatedQuery(req, listQuerySchema)
  const { id: userId } = req.user!

  const document = await prisma.document.findFirst({
    where: { id: documentId, ...documentVisibilityFilter(userId) },
  })
  if (!document) {
    throw new NotFoundError()
  }

  const cursorPage = cursor ? decodeCursor(cursor) : null

  const events = await prisma.auditEvent.findMany({
    where: {
      AND: [
        { documentId },
        ...(cursorPage
          ? [
              {
                OR: [
                  { timestamp: { lt: cursorPage.createdAt } },
                  { timestamp: cursorPage.createdAt, id: { lt: cursorPage.id } },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: { actor: { select: { id: true, email: true } } },
  })

  const hasMore = events.length > limit
  const page = events.slice(0, limit)
  const last = page[page.length - 1]

  res.json({
    items: page,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.timestamp, id: last.id }) : null,
  })
}
