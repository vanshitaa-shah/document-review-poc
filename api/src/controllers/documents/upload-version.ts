import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.ts'
import { documentCategoryFilter } from '../../lib/categoryAccess.ts'
import { recordAuditEvent } from '../../lib/audit.ts'
import { touchDocument } from '../../lib/documentActivity.ts'
import { withSerializableRetry } from '../../lib/dbRetry.ts'
import { ConflictError, NotFoundError } from '../../lib/errors.ts'
import { transactionOptions } from '../../lib/transactionOptions.ts'
import { requireFile, versionFileFields } from '../../lib/uploadedFile.ts'
import { paramsSchema } from '../../schemas/documents.schema.ts'

// Revision upload — stored as a pending draft (isCurrent = false) so the version
// under review stays current and visible to reviewers until the author submits.
// The swap to current happens in submit-document.ts. If the current version is
// itself an unsubmitted draft, nobody has seen it, so it is simply replaced.
// One SERIALIZABLE transaction; see versioning-invariants skill, rules 1, 3 & 5.
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

        const replacesCurrent = current.status === 'DRAFT'

        if (replacesCurrent) {
          await tx.documentVersion.update({
            where: { id: current.id },
            data: { isCurrent: false, status: 'DISCARDED' },
          })
        }

        // Replace an earlier pending draft — the author's newer upload wins.
        const staleDraft = replacesCurrent
          ? null
          : await tx.documentVersion.findFirst({
              where: { documentId, isCurrent: false, status: 'DRAFT' },
            })
        if (staleDraft) {
          await tx.documentVersion.update({
            where: { id: staleDraft.id },
            data: { status: 'DISCARDED' },
          })
        }

        const latest = await tx.documentVersion.aggregate({
          where: { documentId },
          _max: { versionNumber: true },
        })

        const created = await tx.documentVersion.create({
          data: {
            documentId,
            versionNumber: (latest._max.versionNumber ?? current.versionNumber) + 1,
            ...fileFields,
            uploadedById: userId,
            isCurrent: replacesCurrent,
            status: 'DRAFT',
          },
        })

        const superseded = replacesCurrent ? current : staleDraft
        if (superseded) {
          await recordAuditEvent(tx, {
            actorId: userId,
            action: 'VERSION_SUPERSEDED',
            documentId,
            versionId: superseded.id,
            metadata: { supersededBy: created.id },
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
