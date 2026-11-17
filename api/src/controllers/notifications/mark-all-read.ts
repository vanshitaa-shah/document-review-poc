import type { Request, Response } from 'express'
import { prisma } from '../../lib/prisma.ts'

// Marks every unread notification of the caller read.
export async function markAllNotificationsRead(req: Request, res: Response) {
  const { id: userId } = req.user!

  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  })

  res.status(204).send()
}
