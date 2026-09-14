import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { ValidationError } from './errors.js'

export const ALLOWED_EXTENSIONS = new Set(['.txt', '.pdf', '.md', '.docx', '.html'])
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

const uploadDir = process.env.UPLOAD_DIR ?? './uploads'
mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  },
})

export const upload = multer({
  storage,
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
