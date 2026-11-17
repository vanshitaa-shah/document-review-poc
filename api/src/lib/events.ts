import { EventEmitter } from 'node:events'
import type { Notification } from '@prisma/client'

// In-process pub/sub that feeds the SSE streams (controllers/notifications/stream-notifications.ts).
// Single API instance only — with more than one, swap this for Postgres LISTEN/NOTIFY.
// Nothing here is a source of truth: every notification is already a committed row
// in `notifications`, so a client that misses a push just refetches the list.
const bus = new EventEmitter()
// One listener per open tab, per user — the default cap of 10 would warn spuriously.
bus.setMaxListeners(0)

export type NotificationListener = (notification: Notification) => void

export function subscribeToNotifications(userId: string, listener: NotificationListener): () => void {
  bus.on(userId, listener)
  return () => bus.off(userId, listener)
}

// Call only after the transaction that created these rows has committed.
export function publishNotifications(notifications: Notification[]) {
  for (const notification of notifications) {
    bus.emit(notification.userId, notification)
  }
}
