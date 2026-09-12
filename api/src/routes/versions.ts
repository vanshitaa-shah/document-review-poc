import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { approveVersion, downloadVersion, requestChanges } from '../controllers/versions/index.js'
import {
  requestChangesBodySchema,
  versionIdParamSchema,
  versionParamsSchema,
} from '../schemas/reviews.schema.js'

export const versionsRouter = Router()

// Reviewer approves the current submitted version; a stale version gets a named 409.
versionsRouter.post(
  '/:versionId/approve',
  requireAuth,
  requireRole('REVIEWER'),
  validate({ params: versionParamsSchema }),
  approveVersion,
)

// Reviewer sends the current submitted version back for changes, with a required comment.
versionsRouter.post(
  '/:versionId/request-changes',
  requireAuth,
  requireRole('REVIEWER'),
  validate({ params: versionParamsSchema, body: requestChangesBodySchema }),
  requestChanges,
)

// Downloads a version's file, plus its approval record if one exists.
versionsRouter.get(
  '/:id/download',
  requireAuth,
  validate({ params: versionIdParamSchema }),
  downloadVersion,
)
