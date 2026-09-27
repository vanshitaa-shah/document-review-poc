import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.ts'
import { documentVisibilityFilter } from '../../lib/categoryAccess.ts'
import { withCurrentVersion } from '../../lib/documentResponse.ts'
import { NotFoundError } from '../../lib/errors.ts'
import { paramsSchema } from '../../schemas/documents.schema.ts'

// Fetches one document with its current version, scoped to category + draft visibility.
export async function getDocument(req: Request, res: Response) {
  const { id } = req.params as z.infer<typeof paramsSchema>
  const { id: userId, role } = req.user!

  const document = await prisma.document.findFirst({
    where: { id, ...documentVisibilityFilter(userId, role) },
    include: {
      versions: {
        where: { isCurrent: true },
        include: { approval: { include: { approver: { select: { id: true, email: true } } } } },
      },
      category: { select: { id: true, name: true } },
    },
  })

  if (!document) {
    throw new NotFoundError()
  }

  res.json(withCurrentVersion(document))
}
