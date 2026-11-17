import { z } from 'zod'

export const notificationsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  unread: z.enum(['true', 'false']).optional(),
})

export const notificationParamsSchema = z.object({ id: z.string().uuid() })
