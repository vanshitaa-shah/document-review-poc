import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.ts'
import { documentVersionCategoryFilter } from '../../lib/categoryAccess.ts'
import { recordAuditEvent } from '../../lib/audit.ts'
import { touchDocument } from '../../lib/documentActivity.ts'
import { transactionOptions } from '../../lib/transactionOptions.ts'
import { NotFoundError } from '../../lib/errors.ts'
import { commentParamsSchema, createReplySchema } from '../../schemas/comments.schema.ts'
import { isHiddenFromUser } from '../../lib/versionVisibility.ts'

// The document's author or a reviewer with category access replies; discussion only, so version status is untouched.
export async function createReply(req: Request, res: Response) {
  const { id: versionId, commentId } = req.params as z.infer<typeof commentParamsSchema>
  const { body } = req.body as z.infer<typeof createReplySchema>
  const { id: userId, role } = req.user!

  const version = await prisma.documentVersion.findFirst({
    where: { id: versionId, ...documentVersionCategoryFilter(userId) },
    include: { document: true },
  })
  if (!version || isHiddenFromUser(version, userId, role)) {
    throw new NotFoundError()
  }
  // Authors who don't own the document are already hidden above; this covers other roles (e.g. admin).
  if (role !== 'REVIEWER' && version.document.authorId !== userId) {
    throw new NotFoundError()
  }

  const target = await prisma.comment.findFirst({ where: { id: commentId, versionId } })
  if (!target) {
    throw new NotFoundError()
  }
  const root = target.parentId
    ? await prisma.comment.findFirst({ where: { id: target.parentId, versionId } })
    : target
  if (!root) {
    throw new NotFoundError()
  }

  const reply = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        versionId,
        authorId: userId,
        body,
        parentId: root.id,
        anchorQuote: root.anchorQuote,
        anchorPrefix: root.anchorPrefix,
        anchorSuffix: root.anchorSuffix,
        anchorStart: root.anchorStart,
        anchorEnd: root.anchorEnd,
      },
      include: { author: { select: { id: true, email: true } } },
    })

    await recordAuditEvent(tx, {
      actorId: userId,
      action: 'COMMENT_REPLIED',
      documentId: version.documentId,
      versionId,
      metadata: { comment: body, parentId: root.id },
    })
    await touchDocument(tx, version.documentId)

    return created
  }, transactionOptions)

  res.status(201).json(reply)
}
