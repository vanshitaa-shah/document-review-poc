import { Router } from 'express'
import { requireAuth } from '../middleware/auth.ts'
import { validate } from '../middleware/validate.ts'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  streamNotifications,
} from '../controllers/notifications/index.ts'
import { notificationParamsSchema, notificationsQuerySchema } from '../schemas/notifications.schema.ts'

export const notificationsRouter = Router()

// Live push of the caller's new notifications over SSE.
notificationsRouter.get('/stream', requireAuth, streamNotifications)

// The caller's notifications, newest first, with the unread count.
notificationsRouter.get('/', requireAuth, validate({ query: notificationsQuerySchema }), listNotifications)

// Mark every one of the caller's notifications read.
notificationsRouter.post('/read-all', requireAuth, markAllNotificationsRead)

// Mark one notification read.
notificationsRouter.post('/:id/read', requireAuth, validate({ params: notificationParamsSchema }), markNotificationRead)
