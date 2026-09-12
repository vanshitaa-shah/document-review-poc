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
import { setUnauthorizedHandler } from './apiClient'

export interface AuthUser {
  id: string
  email: string
  role: 'AUTHOR' | 'REVIEWER'
}

interface AuthState {
  token: string | null
  user: AuthUser | null
}

interface AuthContextValue extends AuthState {
  login: (token: string, user: AuthUser) => void
  logout: () => void
}

const STORAGE_KEY = 'document-review-auth'

const AuthContext = createContext<AuthContextValue | null>(null)

function readStoredAuth(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { token: null, user: null }
    }
    return JSON.parse(raw) as AuthState
  } catch {
    return { token: null, user: null }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => readStoredAuth())

  const login = useCallback((token: string, user: AuthUser) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }))
    setState({ token, user })
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setState({ token: null, user: null })
  }, [])

  // Any authenticated request that comes back 401 (expired/invalid token)
  // drops the session the same way an explicit logout does.
  useEffect(() => {
    setUnauthorizedHandler(logout)
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
// when there is no token.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const location = useLocation()

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
