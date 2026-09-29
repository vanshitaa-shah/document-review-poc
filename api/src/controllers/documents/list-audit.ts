import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.ts'
import { documentVisibilityFilter } from '../../lib/categoryAccess.ts'
import { decodeCursor, encodeCursor } from '../../lib/pagination.ts'
import { UNSUBMITTED_STATUSES } from '../../lib/versionVisibility.ts'
import { getValidatedQuery } from '../../middleware/validate.ts'
import { NotFoundError } from '../../lib/errors.ts'
import { listQuerySchema, paramsSchema } from '../../schemas/documents.schema.ts'

// Full audit trail for one document, newest first, cursor-paginated, category access enforced.
export async function listAudit(req: Request, res: Response) {
  const { id: documentId } = req.params as z.infer<typeof paramsSchema>
  const { cursor, limit = 20 } = getValidatedQuery(req, listQuerySchema)
  const { id: userId, role } = req.user!

  const document = await prisma.document.findFirst({
    where: { id: documentId, ...documentVisibilityFilter(userId, role) },
  })
  if (!document) {
    throw new NotFoundError()
  }

  const cursorPage = cursor ? decodeCursor(cursor) : null

  // Events about an author's unsubmitted draft (its upload, its replacement) are
  // private to the author — reviewers' trail only covers versions they could see.
  const hidesUnsubmitted =
    role === 'AUTHOR'
      ? null
      : { OR: [{ versionId: null }, { version: { status: { notIn: UNSUBMITTED_STATUSES } } }] }

  const events = await prisma.auditEvent.findMany({
    where: {
      documentId,
      AND: [
        ...(hidesUnsubmitted ? [hidesUnsubmitted] : []),
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
