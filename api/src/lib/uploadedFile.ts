import { ValidationError } from './errors.js'
import { sha256File } from './fileHash.js'

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
export async function versionFileFields(file: Express.Multer.File): Promise<VersionFileFields> {
  return {
    filePath: file.path,
    fileName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    sha256: await sha256File(file.path),
  }
}
