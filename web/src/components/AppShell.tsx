import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { useAuth } from '../lib/auth'
import { Avatar } from './Avatar'
import { LogoMark } from './Icons'

function tabClass({ isActive }: { isActive: boolean }) {
  return `border-b-2 px-1 py-2.5 text-sm font-medium transition-colors ${
    isActive
      ? 'border-[#fd8c73] text-white'
      : 'border-transparent text-[#afb8c1] hover:border-[#6e7681] hover:text-white'
  }`
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-[#f6f8fa]">
      <header className="bg-[#24292f] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/documents" className="flex items-center gap-2 font-semibold">
            <LogoMark className="h-6 w-6" />
            <span>Doc Review</span>
          </Link>
          <div className="flex items-center gap-3">
            {user && (
              <>
                <span className="hidden items-center gap-2 sm:flex">
                  <Avatar email={user.email} size="sm" />
                  <span className="text-sm text-[#d0d7de]">{user.email}</span>
                  <span className="rounded-full border border-[#3d444d] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#afb8c1]">
                    {user.role}
                  </span>
                </span>
                <button
                  onClick={logout}
                  className="rounded-md border border-[#3d444d] px-2.5 py-1 text-sm text-[#d0d7de] transition-colors hover:border-[#6e7681] hover:bg-white/5 hover:text-white"
                >
                  Sign out
                </button>
              </>
            )}
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-5 px-4 sm:px-6">
          <NavLink to="/documents" className={tabClass} end>
            Documents
          </NavLink>
          {user?.role === 'AUTHOR' && (
            <NavLink to="/documents/new" className={tabClass}>
              New document
            </NavLink>
          )}
          {user?.role === 'REVIEWER' && (
            <NavLink to="/reviews/queue" className={tabClass}>
              Review queue
            </NavLink>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  )
}
