import { readFile } from 'node:fs/promises'
import mammoth from 'mammoth'

// A version's file never changes after upload (a revision is a new version, never
// a mutation of an existing one), so its converted HTML is safe to cache for the
// lifetime of the process — no invalidation needed.
const htmlCache = new Map<string, string>()

export async function getDocxHtml(versionId: string, filePath: string): Promise<string> {
  const cached = htmlCache.get(versionId)
  if (cached !== undefined) {
    return cached
  }

  const buffer = await readFile(filePath)
  const { value: html } = await mammoth.convertToHtml({ buffer })
  htmlCache.set(versionId, html)
  return html
}
