import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ROUTES } from '../lib/constants'
import { formatDateTime } from '../lib/format'
import { useNotifications, type AppNotification } from '../lib/notifications'
import { BellIcon } from './Icons'

// Header bell: unread badge, a dropdown of recent notifications, and a toast for each live push.
export function NotificationBell() {
  const { items, unreadCount, toast, dismissToast, markRead, markAllRead } = useNotifications()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  function openNotification(notification: AppNotification) {
    setOpen(false)
    dismissToast()
    if (!notification.readAt) void markRead(notification.id).catch(() => undefined)
    void navigate(ROUTES.documentDetail(notification.documentId))
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative rounded-md border border-[#3d444d] p-1.5 text-[#d0d7de] transition-colors hover:border-[#6e7681] hover:bg-white/5 hover:text-white"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-[#cf222e] px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-md border border-[#d0d7de] bg-white text-[#1f2328] shadow-lg">
          <div className="flex items-center justify-between border-b border-[#d8dee4] px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => void markAllRead().catch(() => undefined)}
                className="text-xs font-medium text-[#0969da] hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 divide-y divide-[#d8dee4] overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => openNotification(n)}
                  className={`block w-full px-3 py-2.5 text-left transition-colors hover:bg-[#f6f8fa] ${
                    n.readAt ? '' : 'bg-[#ddf4ff]/40'
                  }`}
                >
                  <p className={`text-sm ${n.readAt ? 'text-[#59636e]' : 'font-medium'}`}>{n.message}</p>
                  <p className="mt-0.5 text-xs text-[#6e7781]">{formatDateTime(n.createdAt)}</p>
                </button>
              </li>
            ))}
            {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-[#59636e]">Nothing yet.</li>}
          </ul>
        </div>
      )}

      {toast && !open && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-30 flex w-80 items-start gap-3 rounded-md border border-[#d0d7de] bg-white p-3 text-[#1f2328] shadow-lg"
        >
          <button onClick={() => openNotification(toast)} className="min-w-0 flex-1 text-left">
            <p className="text-sm font-medium">{toast.message}</p>
            <p className="mt-0.5 text-xs text-[#0969da]">View document</p>
          </button>
          <button onClick={dismissToast} aria-label="Dismiss" className="text-[#59636e] hover:text-[#1f2328]">
            ×
          </button>
        </div>
      )}
    </div>
  )
}
