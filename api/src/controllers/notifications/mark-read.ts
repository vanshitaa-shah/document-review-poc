import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.ts'
import { NotFoundError } from '../../lib/errors.ts'
import { notificationParamsSchema } from '../../schemas/notifications.schema.ts'

// Marks one of the caller's notifications read. Someone else's id is a 404, not a 403.
export async function markNotificationRead(req: Request, res: Response) {
  const { id } = req.params as z.infer<typeof notificationParamsSchema>
  const { id: userId } = req.user!

  const { count } = await prisma.notification.updateMany({
    where: { id, userId },
    data: { readAt: new Date() },
  })
  if (count === 0) {
    throw new NotFoundError()
  }

  res.status(204).send()
}
