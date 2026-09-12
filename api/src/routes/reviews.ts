import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { listReviewQueue } from '../controllers/reviews/index.js'
import { queueQuerySchema } from '../schemas/reviews.schema.js'

export const reviewsRouter = Router()

// Current, submitted versions awaiting review in the caller's categories.
reviewsRouter.get(
  '/queue',
  requireAuth,
  requireRole('REVIEWER'),
  validate({ query: queueQuerySchema }),
  listReviewQueue,
)
