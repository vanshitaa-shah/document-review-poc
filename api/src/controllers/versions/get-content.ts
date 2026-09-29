import path from 'node:path'
import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.ts'
import { documentVersionCategoryFilter } from '../../lib/categoryAccess.ts'
import { getDocxHtml } from '../../lib/docxConvert.ts'
import { NotFoundError } from '../../lib/errors.ts'
import { sanitizeVersionHtml } from '../../lib/sanitizeHtml.ts'
import { versionIdParamSchema } from '../../schemas/reviews.schema.ts'
import { getObjectBuffer } from '../../lib/storage.ts'
import { isHiddenFromUser } from '../../lib/versionVisibility.ts'

// Renderable content for the inline-comment view: txt/md come back as plain text
// (the client renders md with react-markdown), docx is converted to HTML
// server-side and cached, html is served as-is (already the target format).
// Anchor offsets are computed client-side against whatever is actually
// rendered — see AnnotatedContent.tsx — so the format doesn't need to match
// the raw file byte-for-byte. The `unsupported` fallback below is now
// unreachable for any file this app accepts (see ALLOWED_EXTENSIONS in
// upload.ts) — kept as a defensive default, not a live code path.
export async function getVersionContent(req: Request, res: Response) {
  const { id } = req.params as z.infer<typeof versionIdParamSchema>
  const { id: userId } = req.user!

  const version = await prisma.documentVersion.findFirst({
    where: { id, ...documentVersionCategoryFilter(userId) },
    include: { document: true },
  })
  if (!version || isHiddenFromUser(version, userId)) {
    throw new NotFoundError()
  }

  const ext = path.extname(version.fileName).toLowerCase()

  if (ext === '.txt') {
    const content = (await getObjectBuffer(version.filePath)).toString('utf8')
    res.json({ format: 'text', content })
    return
  }

  if (ext === '.md') {
    const content = (await getObjectBuffer(version.filePath)).toString('utf8')
    res.json({ format: 'markdown', content })
    return
  }

  if (ext === '.docx') {
    const content = await getDocxHtml(version.id, version.filePath)
    res.json({ format: 'html', content: sanitizeVersionHtml(content) })
    return
  }

  if (ext === '.html') {
    const content = (await getObjectBuffer(version.filePath)).toString('utf8')
    res.json({ format: 'html', content: sanitizeVersionHtml(content) })
    return
  }

  res.json({ format: 'unsupported', content: null })
}
