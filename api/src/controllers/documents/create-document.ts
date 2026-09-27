import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.ts'
import { isCategoryMember } from '../../lib/categoryAccess.ts'
import { recordAuditEvent } from '../../lib/audit.ts'
import { ForbiddenError } from '../../lib/errors.ts'
import { requireFile, versionFileFields } from '../../lib/uploadedFile.ts'
import { transactionOptions } from '../../lib/transactionOptions.ts'
import { createDocumentSchema } from '../../schemas/documents.schema.ts'

// Author uploads the initial file for a new document — version 1, current, DRAFT.
export async function createDocument(req: Request, res: Response) {
  const { title, categoryId } = req.body as z.infer<typeof createDocumentSchema>
  const { id: userId } = req.user!
  const file = requireFile(req.file)

  if (!(await isCategoryMember(userId, categoryId))) {
    throw new ForbiddenError('Not a member of this category')
  }

  const fileFields = await versionFileFields(file)

  const document = await prisma.$transaction(async (tx) => {
    const doc = await tx.document.create({
      data: { title, categoryId, authorId: userId },
    })
    const version = await tx.documentVersion.create({
      data: {
        documentId: doc.id,
        versionNumber: 1,
        ...fileFields,
        uploadedById: userId,
        isCurrent: true,
        status: 'DRAFT',
      },
    })
    await recordAuditEvent(tx, {
      actorId: userId,
      action: 'DOCUMENT_UPLOADED',
      documentId: doc.id,
      versionId: version.id,
    })
    return { ...doc, currentVersion: version }
  }, transactionOptions)

  res.status(201).json(document)
}
