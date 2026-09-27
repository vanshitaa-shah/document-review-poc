import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { documentVersionCategoryFilter } from '../../lib/categoryAccess.js'
import { recordAuditEvent } from '../../lib/audit.js'
import { touchDocument } from '../../lib/documentActivity.js'
import { throwStaleVersionConflict } from '../../lib/reviewConflict.js'
import { transactionOptions } from '../../lib/transactionOptions.js'
import { NotFoundError } from '../../lib/errors.js'
import { createCommentSchema } from '../../schemas/comments.schema.js'
import { versionIdParamSchema } from '../../schemas/reviews.schema.js'

// Any reviewer with category access to this version can add a highlighted
// comment — not just whoever requested changes on it. A comment is itself
// treated as a request for changes: it moves the version to
// CHANGES_REQUESTED via the same single conditional write as
// request-changes.ts (invariant 2 — never read isCurrent/status then write
// separately), and records a Review row so it shows up wherever a formal
// request-changes decision would. Only SUBMITTED or CHANGES_REQUESTED can
// take a new comment this way — a stale (already-APPROVED or superseded)
// version is rejected with the same named-current-version conflict as
// approve/request-changes, not a bare 409.
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

  const comment = await prisma.$transaction(async (tx) => {
    const { count } = await tx.documentVersion.updateMany({
      where: { id: versionId, isCurrent: true, status: { in: ['SUBMITTED', 'CHANGES_REQUESTED'] } },
      data: { status: 'CHANGES_REQUESTED' },
    })
    if (count === 0) {
      await throwStaleVersionConflict(tx, version.documentId)
    }

    const created = await tx.comment.create({
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

    await tx.review.create({
      data: { versionId, reviewerId: userId, status: 'CHANGES_REQUESTED', comment: body, decidedAt: new Date() },
    })
    await recordAuditEvent(tx, {
      actorId: userId,
      action: 'CHANGES_REQUESTED',
      documentId: version.documentId,
      versionId,
      metadata: { comment: body },
    })
    await touchDocument(tx, version.documentId)

    return created
  }, transactionOptions)

  res.status(201).json(comment)
}
