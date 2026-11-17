import type { Request, Response } from 'express'
import { subscribeToNotifications } from '../../lib/events.ts'

// Comment frames keep proxies and the browser from timing out an idle connection.
const HEARTBEAT_MS = 25_000

// Server-Sent Events: pushes each new notification of the caller as it commits.
// Only the caller's own stream is ever subscribed to — userId comes from the auth cookie.
// There is no replay: a client that reconnects refetches GET /notifications for what it missed.
export function streamNotifications(req: Request, res: Response) {
  const { id: userId } = req.user!

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders()
  res.write('retry: 3000\n\n')

  const unsubscribe = subscribeToNotifications(userId, (notification) => {
    res.write(`id: ${notification.id}\nevent: notification\ndata: ${JSON.stringify(notification)}\n\n`)
  })
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS)

  req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
  })
}
