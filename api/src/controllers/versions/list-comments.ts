import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { documentVersionCategoryFilter } from '../../lib/categoryAccess.js'
import { decodeCursor, encodeCursor } from '../../lib/pagination.js'
import { getValidatedQuery } from '../../middleware/validate.js'
import { NotFoundError } from '../../lib/errors.js'
import { commentsQuerySchema } from '../../schemas/comments.schema.js'
import { versionIdParamSchema } from '../../schemas/reviews.schema.js'

// All comments on one version — anchors belong to this version alone, never the
// document, so a superseded version keeps its own comments untouched (see
// versioning-invariants: supersession never mutates history it's superseding).
export async function listComments(req: Request, res: Response) {
  const { id: versionId } = req.params as z.infer<typeof versionIdParamSchema>
  const { cursor, limit = 50 } = getValidatedQuery(req, commentsQuerySchema)
  const { id: userId } = req.user!

  const version = await prisma.documentVersion.findFirst({
    where: { id: versionId, ...documentVersionCategoryFilter(userId) },
    include: { document: true },
  })
  if (!version || (version.status === 'DRAFT' && version.document.authorId !== userId)) {
    throw new NotFoundError()
  }

  const cursorPage = cursor ? decodeCursor(cursor) : null

  const comments = await prisma.comment.findMany({
    where: {
      AND: [
        { versionId },
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
    include: { author: { select: { id: true, email: true } } },
  })

  const hasMore = comments.length > limit
  const page = comments.slice(0, limit)
  const last = page[page.length - 1]

  res.json({
    items: page,
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  })
}
