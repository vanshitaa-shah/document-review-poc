import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { documentVersionCategoryFilter } from '../../lib/categoryAccess.js'
import { ConflictError, NotFoundError } from '../../lib/errors.js'
import { createCommentSchema } from '../../schemas/comments.schema.js'
import { versionIdParamSchema } from '../../schemas/reviews.schema.js'

// Any reviewer with category access to this version can add a highlighted
// comment — not just whoever requested changes on it. Rejected once the
// version is APPROVED and locked, or SUPERSEDED by a newer revision — in
// both cases it's no longer the version anyone should be commenting on.
// Existing comments on a superseded version stay visible via GET; this only
// blocks new ones.
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
  if (version.status === 'SUPERSEDED') {
    throw new ConflictError('Version has been superseded by a newer revision; comments are closed')
  }

  const comment = await prisma.comment.create({
    data: {
      versionId,
      authorId: userId,
      body,
      anchorQuote,
      anchorPrefix: anchorPrefix ?? null,
      anchorSuffix: anchorSuffix ?? null,
      anchorStart,
      anchorEnd,
    },
    include: { author: { select: { id: true, email: true } } },
  })

  res.status(201).json(comment)
}
