import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Navigate, useLocation } from 'react-router'
import { api, setUnauthorizedHandler } from './apiClient'
import type { Role } from './constants'

export interface AuthUser {
  id: string
  email: string
  role: Role
}

interface AuthState {
  user: AuthUser | null
}

interface AuthContextValue extends AuthState {
  login: (user: AuthUser) => void
  logout: () => Promise<void>
}

// Auth itself lives in an httpOnly cookie the browser sends automatically —
// this is only a UI-layer "am I logged in" signal, never the security
// boundary. A stale/expired cookie still gets caught server-side and any API
// call 401s, which the same logout path clears client state for.
const STORAGE_KEY = 'document-review-auth'

const AuthContext = createContext<AuthContextValue | null>(null)

function readStoredAuth(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { user: null }
    }
    return JSON.parse(raw) as AuthState
  } catch {
    return { user: null }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => readStoredAuth())

  const login = useCallback((user: AuthUser) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user }))
    setState({ user })
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      localStorage.removeItem(STORAGE_KEY)
      setState({ user: null })
    }
  }, [])

  // Any authenticated request that comes back 401 (expired/invalid cookie)
  // drops the session the same way an explicit logout does.
  useEffect(() => {
    setUnauthorizedHandler(() => void logout())
    return () => setUnauthorizedHandler(null)
  }, [logout])

  const value = useMemo(() => ({ ...state, login, logout }), [state, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}

// Route guard: redirects to /login (remembering where the user was headed)
// when there is no signed-in user.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

// Role guard for routes that only make sense for one role (the review queue,
// the new-document form). Assumes RequireAuth already ran — sends anyone else
// back to the document list rather than a blank/broken page.
export function RequireRole({ role, children }: { role: AuthUser['role']; children: ReactNode }) {
  const { user } = useAuth()

  if (user?.role !== role) {
    return <Navigate to="/documents" replace />
  }

  return <>{children}</>
}
