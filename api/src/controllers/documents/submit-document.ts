import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.ts'
import { documentCategoryFilter } from '../../lib/categoryAccess.ts'
import { recordAuditEvent } from '../../lib/audit.ts'
import { touchDocument } from '../../lib/documentActivity.ts'
import { withSerializableRetry } from '../../lib/dbRetry.ts'
import { ConflictError, NotFoundError } from '../../lib/errors.ts'
import { transactionOptions } from '../../lib/transactionOptions.ts'
import { paramsSchema } from '../../schemas/documents.schema.ts'

// Submits the author's draft, making it visible to reviewers. First submit just flips
// the current DRAFT to SUBMITTED. Submitting a revision is the supersession: one
// SERIALIZABLE transaction that demotes the reviewed version, promotes the draft,
// and audits. See versioning-invariants skill, rules 1, 3 & 5.
export async function submitDocument(req: Request, res: Response) {
  const { id: documentId } = req.params as z.infer<typeof paramsSchema>
  const { id: userId } = req.user!

  const document = await prisma.document.findFirst({
    where: { id: documentId, authorId: userId, ...documentCategoryFilter(userId) },
  })
  if (!document) {
    throw new NotFoundError()
  }

  await withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const [current] = await tx.$queryRaw<Array<{ id: string; versionNumber: number; status: string }>>`
          SELECT id, "versionNumber", status FROM "DocumentVersion"
          WHERE "documentId" = ${documentId} AND "isCurrent" = true
          FOR UPDATE
        `
        if (!current) {
          throw new ConflictError('Document has no current version')
        }

        // First submission: the current version is the draft.
        if (current.status === 'DRAFT') {
          await tx.documentVersion.update({ where: { id: current.id }, data: { status: 'SUBMITTED' } })
          await recordAuditEvent(tx, { actorId: userId, action: 'SUBMITTED', documentId, versionId: current.id })
          await touchDocument(tx, documentId)
          return
        }

        if (current.status === 'APPROVED') {
          throw new ConflictError(
            `Version v${current.versionNumber} is approved and locked; the document is finished`,
          )
        }

        const draft = await tx.documentVersion.findFirst({
          where: { documentId, isCurrent: false, status: 'DRAFT' },
        })
        if (!draft) {
          throw new ConflictError('No draft revision to submit')
        }

        // Demote before promoting — the partial unique index allows one current row.
        await tx.documentVersion.update({
          where: { id: current.id },
          data: { isCurrent: false, status: 'SUPERSEDED' },
        })
        await tx.documentVersion.update({
          where: { id: draft.id },
          data: { isCurrent: true, status: 'SUBMITTED' },
        })

        await recordAuditEvent(tx, {
          actorId: userId,
          action: 'VERSION_SUPERSEDED',
          documentId,
          versionId: current.id,
          metadata: { supersededBy: draft.id },
        })
        await recordAuditEvent(tx, { actorId: userId, action: 'SUBMITTED', documentId, versionId: draft.id })
        await touchDocument(tx, documentId)
      },
      { isolationLevel: 'Serializable', ...transactionOptions },
    ),
  )

  res.status(204).send()
}
