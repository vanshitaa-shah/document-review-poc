import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { useAuth } from '../lib/auth'

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
  }`
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-gray-900">Doc Review</span>
            <nav className="ml-4 flex items-center gap-1">
              <NavLink to="/documents" className={navLinkClass} end>
                Documents
              </NavLink>
              {user?.role === 'AUTHOR' && (
                <NavLink to="/documents/new" className={navLinkClass}>
                  New document
                </NavLink>
              )}
              {user?.role === 'REVIEWER' && (
                <NavLink to="/reviews/queue" className={navLinkClass}>
                  Review queue
                </NavLink>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{user?.email}</span>
            <button
              onClick={logout}
              className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  )
}
