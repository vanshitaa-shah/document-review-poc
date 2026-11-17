import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api } from './apiClient'
import { useAuth } from './auth'

export interface AppNotification {
  id: string
  type: string
  documentId: string
  versionId: string
  message: string
  createdAt: string
  readAt: string | null
}

interface NotificationsResponse {
  items: AppNotification[]
  unreadCount: number
  nextCursor: string | null
}

type Listener = (notification: AppNotification) => void

interface NotificationsContextValue {
  items: AppNotification[]
  unreadCount: number
  // The newest pushed notification, for the transient toast — cleared by dismissToast.
  toast: AppNotification | null
  dismissToast: () => void
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  subscribe: (listener: Listener) => () => void
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

// Opens one SSE stream per signed-in session. The server keeps no replay buffer, so every
// (re)connect refetches the list — that is what covers anything missed while disconnected.
// Pages that show live data register through useNotificationEvents instead of opening their own stream.
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [items, setItems] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [toast, setToast] = useState<AppNotification | null>(null)
  const listeners = useRef(new Set<Listener>())

  const refetch = useCallback(async () => {
    try {
      const res = await api.get<NotificationsResponse>('/notifications?limit=20')
      setItems(res.items)
      setUnreadCount(res.unreadCount)
    } catch {
      // Non-fatal — the bell just stays as it was; the next push or reconnect retries.
    }
  }, [])

  useEffect(() => {
    if (!userId) {
      setItems([])
      setUnreadCount(0)
      setToast(null)
      return
    }

    const source = new EventSource('/notifications/stream')
    // Fires on first connect and on every automatic reconnect.
    source.onopen = () => void refetch()
    source.addEventListener('notification', (event) => {
      const notification = JSON.parse((event as MessageEvent<string>).data) as AppNotification
      setItems((prev) => (prev.some((n) => n.id === notification.id) ? prev : [notification, ...prev]))
      setUnreadCount((count) => count + 1)
      setToast(notification)
      listeners.current.forEach((listener) => listener(notification))
    })
    return () => source.close()
  }, [userId, refetch])

  // The toast clears itself; a newer push replaces it and restarts the timer.
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(timer)
  }, [toast])

  const markRead = useCallback(async (id: string) => {
    await api.post(`/notifications/${id}/read`)
    setItems((prev) => prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)))
    setUnreadCount((count) => Math.max(0, count - 1))
  }, [])

  const markAllRead = useCallback(async () => {
    await api.post('/notifications/read-all')
    const now = new Date().toISOString()
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })))
    setUnreadCount(0)
  }, [])

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])

  const dismissToast = useCallback(() => setToast(null), [])

  const value = useMemo(
    () => ({ items, unreadCount, toast, dismissToast, markRead, markAllRead, subscribe }),
    [items, unreadCount, toast, dismissToast, markRead, markAllRead, subscribe],
  )

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext)
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationsProvider')
  }
  return ctx
}

// Runs `handler` for every notification pushed while the caller is mounted — how a page
// refreshes itself live. The latest handler is always the one called, so it can close over state.
export function useNotificationEvents(handler: Listener) {
  const { subscribe } = useNotifications()
  const latest = useRef(handler)
  latest.current = handler

  useEffect(() => subscribe((notification) => latest.current(notification)), [subscribe])
}
