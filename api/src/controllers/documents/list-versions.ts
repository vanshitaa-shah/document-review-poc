import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.ts'
import { documentVersionCategoryFilter, documentVisibilityFilter } from '../../lib/categoryAccess.ts'
import { getValidatedQuery } from '../../middleware/validate.ts'
import { NotFoundError } from '../../lib/errors.ts'
import { paramsSchema, versionsQuerySchema } from '../../schemas/documents.schema.ts'

// Full version history for a document — uploader, status, current flag — newest first.
export async function listVersions(req: Request, res: Response) {
  const { id: documentId } = req.params as z.infer<typeof paramsSchema>
  const { cursor, limit = 20 } = getValidatedQuery(req, versionsQuerySchema)
  const { id: userId, role } = req.user!

  const document = await prisma.document.findFirst({
    where: { id: documentId, ...documentVisibilityFilter(userId, role) },
  })
  if (!document) {
    throw new NotFoundError()
  }

  const versions = await prisma.documentVersion.findMany({
    where: {
      documentId,
      ...documentVersionCategoryFilter(userId),
      // Unsubmitted drafts belong to the author alone.
      ...(role !== 'AUTHOR' && { status: { not: 'DRAFT' as const } }),
      ...(cursor && { versionNumber: { lt: cursor } }),
    },
    orderBy: { versionNumber: 'desc' },
    take: limit + 1,
    include: {
      uploadedBy: { select: { id: true, email: true } },
      approval: { include: { approver: { select: { id: true, email: true } } } },
    },
  })

  const hasMore = versions.length > limit
  const page = versions.slice(0, limit)

  res.json({
    items: page,
    nextCursor: hasMore ? page[page.length - 1]!.versionNumber : null,
  })
}
