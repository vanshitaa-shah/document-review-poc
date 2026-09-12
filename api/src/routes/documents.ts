import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { upload } from '../lib/upload.js'
import {
  createDocument,
  getDocument,
  listAudit,
  listDocuments,
  listVersions,
  submitDocument,
  uploadVersion,
} from '../controllers/documents/index.js'
import {
  createDocumentSchema,
  listQuerySchema,
  paramsSchema,
  versionsQuerySchema,
} from '../schemas/documents.schema.js'

export const documentsRouter = Router()

// Lists documents visible to the caller, filtered by category and draft visibility.
documentsRouter.get('/', requireAuth, validate({ query: listQuerySchema }), listDocuments)

// Creates a document and its version 1 (current, DRAFT) from an uploaded file.
documentsRouter.post(
  '/',
  requireAuth,
  requireRole('AUTHOR'),
  upload.single('file'),
  validate({ body: createDocumentSchema }),
  createDocument,
)

// Moves a document's current DRAFT version to SUBMITTED.
documentsRouter.post(
  '/:id/submit',
  requireAuth,
  requireRole('AUTHOR'),
  validate({ params: paramsSchema }),
  submitDocument,
)

// Fetches one document with its current version.
documentsRouter.get('/:id', requireAuth, validate({ params: paramsSchema }), getDocument)

// Uploads a revision, superseding the current version in one transaction.
documentsRouter.post(
  '/:id/versions',
  requireAuth,
  requireRole('AUTHOR'),
  upload.single('file'),
  validate({ params: paramsSchema }),
  uploadVersion,
)

// Returns the full version history for a document, newest first.
documentsRouter.get(
  '/:id/versions',
  requireAuth,
  validate({ params: paramsSchema, query: versionsQuerySchema }),
  listVersions,
)

// Returns the audit trail for a document, newest first.
documentsRouter.get(
  '/:id/audit',
  requireAuth,
  validate({ params: paramsSchema, query: listQuerySchema }),
  listAudit,
)
