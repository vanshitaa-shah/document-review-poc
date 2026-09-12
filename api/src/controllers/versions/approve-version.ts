import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { documentVersionCategoryFilter } from '../../lib/categoryAccess.js'
import { recordAuditEvent } from '../../lib/audit.js'
import { throwStaleVersionConflict } from '../../lib/reviewConflict.js'
import { NotFoundError } from '../../lib/errors.js'
import { versionParamsSchema } from '../../schemas/reviews.schema.js'

// Single conditional write — only the current, submitted version can be approved.
// See versioning-invariants skill, rule 2: never read isCurrent then write separately.
export async function approveVersion(req: Request, res: Response) {
  const { versionId } = req.params as z.infer<typeof versionParamsSchema>
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
      data: { status: 'APPROVED' },
    })
    if (count === 0) {
      await throwStaleVersionConflict(tx, version.documentId)
    }

    await tx.approval.create({ data: { versionId, approverId: userId } })
    await recordAuditEvent(tx, {
      actorId: userId,
      action: 'APPROVED',
      documentId: version.documentId,
      versionId,
    })
  })

  res.status(204).send()
}
