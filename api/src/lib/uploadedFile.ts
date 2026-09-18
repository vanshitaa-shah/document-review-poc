import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { ValidationError } from './errors.js'
import { putObject } from './storage.js'

export function requireFile(file: Express.Multer.File | undefined): Express.Multer.File {
  if (!file) {
    throw new ValidationError('A file is required')
  }
  return file
}

export interface VersionFileFields {
  filePath: string
  fileName: string
  mimeType: string
  size: number
  sha256: string
}

// The handful of DocumentVersion columns that come straight off the multer
// file — shared by the version-1 create path and the revision-upload path.
// `filePath` is the R2 object key, not a local path — it's a generated id,
// never the user's own filename (see fileName for that).
export async function versionFileFields(file: Express.Multer.File): Promise<VersionFileFields> {
  const key = `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`
  const sha256 = createHash('sha256').update(file.buffer).digest('hex')
  await putObject(key, file.buffer)

  return {
    filePath: key,
    fileName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    sha256,
  }
}
