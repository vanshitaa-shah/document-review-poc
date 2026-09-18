import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { documentVersionCategoryFilter } from '../../lib/categoryAccess.js'
import { NotFoundError } from '../../lib/errors.js'
import { versionIdParamSchema } from '../../schemas/reviews.schema.js'
import { getObjectStream } from '../../lib/storage.js'

// Serves the version's file; a DRAFT is only downloadable by its own document's author.
// The approval record (if any) rides along as a header since the body is the file itself.
// The file itself lives in R2, not on this container's disk, so it's streamed
// through rather than handed to res.download() with a local path.
export async function downloadVersion(req: Request, res: Response) {
  const { id } = req.params as z.infer<typeof versionIdParamSchema>
  const { id: userId } = req.user!

  const version = await prisma.documentVersion.findFirst({
    where: { id, ...documentVersionCategoryFilter(userId) },
    include: { document: true, approval: true },
  })
  if (!version || (version.status === 'DRAFT' && version.document.authorId !== userId)) {
    throw new NotFoundError()
  }

  res.setHeader('X-Approval-Record', JSON.stringify(version.approval))
  res.setHeader('Content-Type', version.mimeType)
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(version.fileName)}"`)

  const stream = await getObjectStream(version.filePath)
  stream.pipe(res)
}
