import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { documentVersionCategoryFilter } from '../../lib/categoryAccess.js'
import { ConflictError, NotFoundError } from '../../lib/errors.js'
import { createCommentSchema } from '../../schemas/comments.schema.js'
import { versionIdParamSchema } from '../../schemas/reviews.schema.js'

// Reviewer comments on a version — a highlighted passage (quote+prefix+suffix+
// offsets) or, for formats with no inline rendering (PDF), a version-level
// comment with no anchor at all. Rejected once the version is APPROVED and locked.
export async function createComment(req: Request, res: Response) {
  const { id: versionId } = req.params as z.infer<typeof versionIdParamSchema>
  const { body, anchorQuote, anchorPrefix, anchorSuffix, anchorStart, anchorEnd } = req.body as z.infer<
    typeof createCommentSchema
  >
  const { id: userId } = req.user!

  const version = await prisma.documentVersion.findFirst({
    where: { id: versionId, ...documentVersionCategoryFilter(userId) },
    include: { document: true },
  })
  if (!version || (version.status === 'DRAFT' && version.document.authorId !== userId)) {
    throw new NotFoundError()
  }
  if (version.status === 'APPROVED') {
    throw new ConflictError('Version is approved and locked; comments are closed')
  }

  const comment = await prisma.comment.create({
    data: {
      versionId,
      authorId: userId,
      body,
      // Zod's refine guarantees quote/start/end are given together or not at all.
      ...(anchorQuote !== undefined && anchorStart !== undefined && anchorEnd !== undefined
        ? {
            anchorQuote,
            anchorPrefix: anchorPrefix ?? null,
            anchorSuffix: anchorSuffix ?? null,
            anchorStart,
            anchorEnd,
          }
        : {}),
    },
    include: { author: { select: { id: true, email: true } } },
  })

  res.status(201).json(comment)
}
