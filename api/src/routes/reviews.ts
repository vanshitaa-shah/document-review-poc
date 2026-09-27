import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.ts'
import { validate } from '../middleware/validate.ts'
import { listReviewQueue } from '../controllers/reviews/index.ts'
import { queueQuerySchema } from '../schemas/reviews.schema.ts'

export const reviewsRouter = Router()

// Current, submitted versions awaiting review in the caller's categories.
reviewsRouter.get(
  '/queue',
  requireAuth,
  requireRole('REVIEWER'),
  validate({ query: queueQuerySchema }),
  listReviewQueue,
)
