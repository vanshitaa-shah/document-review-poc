import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { documentVersionCategoryFilter } from '../../lib/categoryAccess.js'
import { getDocxHtml } from '../../lib/docxConvert.js'
import { NotFoundError } from '../../lib/errors.js'
import { versionIdParamSchema } from '../../schemas/reviews.schema.js'

// Renderable content for the inline-comment view: txt/md come back as plain text
// (the client renders md with react-markdown), docx is converted to HTML
// server-side and cached. Anchor offsets are computed client-side against
// whatever is actually rendered — see AnnotatedContent.tsx — so the format
// doesn't need to match the raw file byte-for-byte. pdf has no inline
// rendering; callers fall back to version-level comments only.
export async function getVersionContent(req: Request, res: Response) {
  const { id } = req.params as z.infer<typeof versionIdParamSchema>
  const { id: userId } = req.user!

  const version = await prisma.documentVersion.findFirst({
    where: { id, ...documentVersionCategoryFilter(userId) },
    include: { document: true },
  })
  if (!version || (version.status === 'DRAFT' && version.document.authorId !== userId)) {
    throw new NotFoundError()
  }

  const ext = path.extname(version.fileName).toLowerCase()

  if (ext === '.txt') {
    const content = await readFile(version.filePath, 'utf8')
    res.json({ format: 'text', content })
    return
  }

  if (ext === '.md') {
    const content = await readFile(version.filePath, 'utf8')
    res.json({ format: 'markdown', content })
    return
  }

  if (ext === '.docx') {
    const content = await getDocxHtml(version.id, version.filePath)
    res.json({ format: 'html', content })
    return
  }

  res.json({ format: 'unsupported', content: null })
}
