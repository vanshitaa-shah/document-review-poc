import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api } from '../lib/apiClient'
import { useAuth, type AuthUser } from '../lib/auth'
import { ErrorMessage } from '../components/ErrorMessage'
import { LogoMark } from '../components/Icons'
import { btnPrimary, input, label } from '../lib/ui'

interface LoginResponse {
  token: string
  user: AuthUser
}

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { token, user } = await api.post<LoginResponse>('/auth/login', { email, password }, null)
      login(token, user)
      const from = (location.state as { from?: Location })?.from?.pathname ?? '/documents'
      navigate(from, { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f6f8fa] px-4">
      <div className="mb-6 flex items-center gap-2 text-[#1f2328]">
        <LogoMark className="h-8 w-8" />
        <span className="text-xl font-semibold">Doc Review</span>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-md border border-[#d0d7de] bg-white p-8 shadow-sm"
      >
        <div>
          <h1 className="text-base font-semibold text-[#1f2328]">Sign in</h1>
          <p className="mt-1 text-sm text-[#59636e]">Review and approve documents for your team.</p>
        </div>

        <ErrorMessage error={error} />

        <div className="space-y-1">
          <label htmlFor="email" className={label}>
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className={label}>
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
        </div>

        <button type="submit" disabled={submitting} className={`${btnPrimary} w-full py-2`}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
