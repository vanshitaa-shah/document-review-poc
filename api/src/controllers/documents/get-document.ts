import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { documentVisibilityFilter } from '../../lib/categoryAccess.js'
import { withCurrentVersion } from '../../lib/documentResponse.js'
import { NotFoundError } from '../../lib/errors.js'
import { paramsSchema } from '../../schemas/documents.schema.js'

// Fetches one document with its current version, scoped to category + draft visibility.
export async function getDocument(req: Request, res: Response) {
  const { id } = req.params as z.infer<typeof paramsSchema>
  const { id: userId } = req.user!

  const document = await prisma.document.findFirst({
    where: { id, ...documentVisibilityFilter(userId) },
    include: { versions: { where: { isCurrent: true } } },
  })

  if (!document) {
    throw new NotFoundError()
  }

  res.json(withCurrentVersion(document))
}
