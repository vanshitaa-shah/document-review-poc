import path from 'node:path'
import multer from 'multer'
import { ValidationError } from './errors.js'

export const ALLOWED_EXTENSIONS = new Set(['.txt', '.pdf', '.md', '.docx', '.html'])
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

// Buffered in memory, not written to local disk — the file goes straight to
// R2 from the buffer (see uploadedFile.ts). Fine at this size ceiling (10MB).
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(new ValidationError(`Unsupported file type: ${ext || 'unknown'}`))
      return
    }
    cb(null, true)
  },
})
