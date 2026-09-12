import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { documentVersionCategoryFilter } from '../../lib/categoryAccess.js'
import { recordAuditEvent } from '../../lib/audit.js'
import { throwStaleVersionConflict } from '../../lib/reviewConflict.js'
import { NotFoundError } from '../../lib/errors.js'
import { requestChangesBodySchema, versionParamsSchema } from '../../schemas/reviews.schema.js'

// Same stale-version guard as approve; the required comment lives on the Review row.
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
      where: { id: versionId, isCurrent: true, status: 'SUBMITTED' },
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
  })

  res.status(204).send()
}
