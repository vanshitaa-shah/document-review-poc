import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { documentCategoryFilter } from '../../lib/categoryAccess.js'
import { recordAuditEvent } from '../../lib/audit.js'
import { touchDocument } from '../../lib/documentActivity.js'
import { withSerializableRetry } from '../../lib/dbRetry.js'
import { ConflictError, NotFoundError } from '../../lib/errors.js'
import { transactionOptions } from '../../lib/transactionOptions.js'
import { requireFile, versionFileFields } from '../../lib/uploadedFile.js'
import { paramsSchema } from '../../schemas/documents.schema.js'

// Revision upload — one SERIALIZABLE transaction: lock the current version,
// demote it, insert the new one, cancel any pending reviews on the old one,
// and audit all of it together. See versioning-invariants skill, rules 1 & 3.
export async function uploadVersion(req: Request, res: Response) {
  const { id: documentId } = req.params as z.infer<typeof paramsSchema>
  const { id: userId } = req.user!
  const file = requireFile(req.file)

  const document = await prisma.document.findFirst({
    where: { id: documentId, authorId: userId, ...documentCategoryFilter(userId) },
  })
  if (!document) {
    throw new NotFoundError()
  }

  const fileFields = await versionFileFields(file)

  const newVersion = await withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const [current] = await tx.$queryRaw<
          Array<{ id: string; versionNumber: number; status: string }>
        >`
          SELECT id, "versionNumber", status FROM "DocumentVersion"
          WHERE "documentId" = ${documentId} AND "isCurrent" = true
          FOR UPDATE
        `
        if (!current) {
          throw new ConflictError('Document has no current version')
        }
        if (current.status === 'APPROVED') {
          throw new ConflictError(
            `Version v${current.versionNumber} is approved and locked; the document is finished`,
          )
        }

        await tx.documentVersion.update({
          where: { id: current.id },
          data: { isCurrent: false, status: 'SUPERSEDED' },
        })

        const created = await tx.documentVersion.create({
          data: {
            documentId,
            versionNumber: current.versionNumber + 1,
            ...fileFields,
            uploadedById: userId,
            isCurrent: true,
            status: 'DRAFT',
          },
        })

        const pendingReviews = await tx.review.findMany({
          where: { versionId: current.id, status: 'PENDING' },
        })
        if (pendingReviews.length > 0) {
          await tx.review.updateMany({
            where: { id: { in: pendingReviews.map((r) => r.id) } },
            data: { status: 'SUPERSEDED', decidedAt: new Date() },
          })
        }

        await recordAuditEvent(tx, {
          actorId: userId,
          action: 'VERSION_SUPERSEDED',
          documentId,
          versionId: current.id,
          metadata: { supersededBy: created.id },
        })
        for (const review of pendingReviews) {
          await recordAuditEvent(tx, {
            actorId: userId,
            action: 'REVIEW_CANCELLED',
            documentId,
            versionId: current.id,
            metadata: { reviewId: review.id, reviewerId: review.reviewerId },
          })
        }
        await recordAuditEvent(tx, {
          actorId: userId,
          action: 'VERSION_UPLOADED',
          documentId,
          versionId: created.id,
        })
        await touchDocument(tx, documentId)

        return created
      },
      { isolationLevel: 'Serializable', ...transactionOptions },
    ),
  )

  res.status(201).json(newVersion)
}
