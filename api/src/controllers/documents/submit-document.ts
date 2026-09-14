import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { documentCategoryFilter } from '../../lib/categoryAccess.js'
import { recordAuditEvent } from '../../lib/audit.js'
import { touchDocument } from '../../lib/documentActivity.js'
import { ConflictError, NotFoundError } from '../../lib/errors.js'
import { paramsSchema } from '../../schemas/documents.schema.js'

// Moves the current version from DRAFT to SUBMITTED, making it visible to reviewers.
export async function submitDocument(req: Request, res: Response) {
  const { id } = req.params as z.infer<typeof paramsSchema>
  const { id: userId } = req.user!

  const document = await prisma.document.findFirst({
    where: { id, authorId: userId, ...documentCategoryFilter(userId) },
  })
  if (!document) {
    throw new NotFoundError()
  }

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.documentVersion.updateMany({
      where: { documentId: id, isCurrent: true, status: 'DRAFT' },
      data: { status: 'SUBMITTED' },
    })
    if (count === 0) {
      throw new ConflictError('Current version is not a draft')
    }

    const current = await tx.documentVersion.findFirst({
      where: { documentId: id, isCurrent: true },
    })
    await recordAuditEvent(tx, {
      actorId: userId,
      action: 'SUBMITTED',
      documentId: id,
      versionId: current!.id,
    })
    await touchDocument(tx, id)
  })

  res.status(204).send()
}
