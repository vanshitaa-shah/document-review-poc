import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { documentVersionCategoryFilter } from '../../lib/categoryAccess.js'
import { recordAuditEvent } from '../../lib/audit.js'
import { touchDocument } from '../../lib/documentActivity.js'
import { throwStaleVersionConflict } from '../../lib/reviewConflict.js'
import { NotFoundError } from '../../lib/errors.js'
import { requestChangesBodySchema, versionParamsSchema } from '../../schemas/reviews.schema.js'

// Same stale-version guard as approve; the required comment lives on the Review row.
// Unlike approve, this accepts both SUBMITTED and CHANGES_REQUESTED — any
// reviewer with category access can request changes again (a second
// reviewer, or a follow-up reason) as long as the version hasn't been
// approved or superseded yet.
export async function requestChanges(req: Request, res: Response) {
  const { versionId } = req.params as z.infer<typeof versionParamsSchema>
  const { comment } = req.body as z.infer<typeof requestChangesBodySchema>
  const { id: userId } = req.user!

  const version = await prisma.documentVersion.findFirst({
    where: { id: versionId, ...documentVersionCategoryFilter(userId) },
  })
  if (!version) {
    throw new NotFoundError()
  }

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.documentVersion.updateMany({
      where: { id: versionId, isCurrent: true, status: { in: ['SUBMITTED', 'CHANGES_REQUESTED'] } },
      data: { status: 'CHANGES_REQUESTED' },
    })
    if (count === 0) {
      await throwStaleVersionConflict(tx, version.documentId)
    }

    await tx.review.create({
      data: {
        versionId,
        reviewerId: userId,
        status: 'CHANGES_REQUESTED',
        comment,
        decidedAt: new Date(),
      },
    })
    await recordAuditEvent(tx, {
      actorId: userId,
      action: 'CHANGES_REQUESTED',
      documentId: version.documentId,
      versionId,
      metadata: { comment },
    })
    await touchDocument(tx, version.documentId)
  })

  res.status(204).send()
}
