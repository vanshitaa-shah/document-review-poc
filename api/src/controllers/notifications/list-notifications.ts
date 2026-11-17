import type { Request, Response } from 'express'
import { prisma } from '../../lib/prisma.ts'
import { decodeCursor, encodeCursor } from '../../lib/pagination.ts'
import { getValidatedQuery } from '../../middleware/validate.ts'
import { notificationsQuerySchema } from '../../schemas/notifications.schema.ts'

// The caller's own notifications, newest first, plus their total unread count for the bell badge.
export async function listNotifications(req: Request, res: Response) {
  const { cursor, limit = 20, unread } = getValidatedQuery(req, notificationsQuerySchema)
  const { id: userId } = req.user!

  const cursorPage = cursor ? decodeCursor(cursor) : null

  // Keyset pagination: strictly older than the cursor, or same instant but a lower id.
  const isAfterCursor = cursorPage
    ? {
        OR: [
          { createdAt: { lt: cursorPage.createdAt } },
          { createdAt: cursorPage.createdAt, id: { lt: cursorPage.id } },
        ],
      }
    : null

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: {
        userId,
        ...(unread === 'true' && { readAt: null }),
        ...(isAfterCursor ?? {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ])

  const hasMore = rows.length > limit
  const items = rows.slice(0, limit)
  const last = items[items.length - 1]

  res.json({
    items,
    unreadCount,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  })
}
