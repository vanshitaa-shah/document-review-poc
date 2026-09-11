import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { isCategoryMember } from '../../lib/categoryAccess.js'
import { recordAuditEvent } from '../../lib/audit.js'
import { ForbiddenError } from '../../lib/errors.js'
import { requireFile, versionFileFields } from '../../lib/uploadedFile.js'
import { createDocumentSchema } from '../../schemas/documents.schema.js'

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
      action: 'DOCUMENT_CREATED',
      documentId: doc.id,
      versionId: version.id,
    })
    return { ...doc, currentVersion: version }
  })

  res.status(201).json(document)
}
