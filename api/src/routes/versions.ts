import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import {
  approveVersion,
  createComment,
  downloadVersion,
  getVersionContent,
  listComments,
  requestChanges,
} from '../controllers/versions/index.js'
import { commentsQuerySchema, createCommentSchema } from '../schemas/comments.schema.js'
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

// Renderable text/HTML content for the inline-comment view.
versionsRouter.get(
  '/:id/content',
  requireAuth,
  validate({ params: versionIdParamSchema }),
  getVersionContent,
)

// All comments on this version, newest first.
versionsRouter.get(
  '/:id/comments',
  requireAuth,
  validate({ params: versionIdParamSchema, query: commentsQuerySchema }),
  listComments,
)

// Any reviewer with category access adds a highlighted comment; rejected once approved.
versionsRouter.post(
  '/:id/comments',
  requireAuth,
  requireRole('REVIEWER'),
  validate({ params: versionIdParamSchema, body: createCommentSchema }),
  createComment,
)
