import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { upload } from '../lib/upload.js'
import {
  createDocument,
  createDocumentSchema,
  getDocument,
  listDocuments,
  listQuerySchema,
  listVersions,
  paramsSchema,
  submitDocument,
  uploadVersion,
  versionsQuerySchema,
} from '../controllers/documents.controller.js'

export const documentsRouter = Router()

documentsRouter.get('/', requireAuth, validate({ query: listQuerySchema }), listDocuments)

documentsRouter.post(
  '/',
  requireAuth,
  requireRole('AUTHOR'),
  upload.single('file'),
  validate({ body: createDocumentSchema }),
  createDocument,
)

documentsRouter.post(
  '/:id/submit',
  requireAuth,
  requireRole('AUTHOR'),
  validate({ params: paramsSchema }),
  submitDocument,
)

documentsRouter.get('/:id', requireAuth, validate({ params: paramsSchema }), getDocument)

documentsRouter.post(
  '/:id/versions',
  requireAuth,
  requireRole('AUTHOR'),
  upload.single('file'),
  validate({ params: paramsSchema }),
  uploadVersion,
)

documentsRouter.get(
  '/:id/versions',
  requireAuth,
  validate({ params: paramsSchema, query: versionsQuerySchema }),
  listVersions,
)
