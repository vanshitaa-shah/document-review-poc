import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/apiClient'
import { AppShell } from '../components/AppShell'
import { ErrorMessage } from '../components/ErrorMessage'
import { Role } from '../lib/constants'
import { btnDefault, btnPrimary, card, fainterText, input, label, mutedText, pageHeading, select } from '../lib/ui'

interface Category {
  id: string
  name: string
}

interface RoleOption {
  id: string
  name: string
}

interface CreatedUser {
  id: string
  email: string
  role: string
}

const MIN_PASSWORD_LENGTH = 8

// Readable characters only — no 0/O or 1/l/I — since the admin hands this to someone by hand.
function generatePassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export function CreateUserPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [roleId, setRoleId] = useState('')
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [error, setError] = useState<unknown>(null)
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<{ user: CreatedUser; password: string } | null>(null)

  useEffect(() => {
    void api
      .get<{ items: Category[] }>('/categories')
      .then((res) => setCategories(res.items))
      .catch(setError)

    void api
      .get<{ items: RoleOption[] }>('/admin/roles')
      .then((res) => {
        setRoles(res.items)
        setRoleId((current) => current || res.items[0]?.id || '')
      })
      .catch(setError)
  }, [])

  // A reviewer works in exactly one category for now; an author can span several.
  const singleCategory = roles.find((r) => r.id === roleId)?.name === Role.REVIEWER

  function toggleCategory(id: string) {
    setCategoryIds((current) => {
      if (singleCategory) return [id]
      return current.includes(id) ? current.filter((c) => c !== id) : [...current, id]
    })
  }

  function changeRole(nextId: string) {
    setRoleId(nextId)
    // Switching to reviewer with several ticked: keep just the first.
    if (roles.find((r) => r.id === nextId)?.name === Role.REVIEWER) setCategoryIds((current) => current.slice(0, 1))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setCreated(null)
    setSubmitting(true)
    try {
      const user = await api.post<CreatedUser>('/admin/users', { email, password, roleId, categoryIds })
      // Shown once: the server keeps only a hash, so this is the admin's only chance to pass it on.
      setCreated({ user, password })
      setEmail('')
      setPassword('')
      setCategoryIds([])
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-lg">
        <h1 className={pageHeading}>Create user</h1>
        <p className={`mt-1 ${mutedText}`}>
          Set an email and password for a new author or reviewer, and choose the categories they belong to.
        </p>

        {created && (
          <div
            role="status"
            className="mt-6 rounded-md border border-[#4ac26b] bg-[#dafbe1] px-4 py-3 text-sm text-[#1a7f37]"
          >
            <p className="font-medium">
              Created {created.user.role.toLowerCase()} {created.user.email}
            </p>
            <p className="mt-1">
              Password: <code className="rounded bg-white/60 px-1.5 py-0.5 font-mono">{created.password}</code>
            </p>
            <p className="mt-1 text-xs">This is the only time the password is shown. Pass it on now.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className={`mt-6 space-y-4 p-6 ${card}`}>
          <ErrorMessage error={error} />

          <div className="space-y-1">
            <label htmlFor="email" className={label}>
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={input}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className={label}>
              Password
            </label>
            <div className="flex gap-2">
              <input
                id="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                className={`${input} font-mono`}
              />
              <button type="button" onClick={() => setPassword(generatePassword())} className={btnDefault}>
                Generate
              </button>
            </div>
            <p className={fainterText}>At least {MIN_PASSWORD_LENGTH} characters.</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="role" className={label}>
              Role
            </label>
            <select
              id="role"
              value={roleId}
              onChange={(e) => changeRole(e.target.value)}
              className={select}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name.charAt(0) + r.name.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="space-y-1">
            <legend className={label}>Categories</legend>
            {categories.length === 0 && <p className={mutedText}>No categories available.</p>}
            <p className={fainterText}>
              {singleCategory ? 'A reviewer belongs to one category.' : 'Pick one or more.'}
            </p>
            {categories.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm text-[#1f2328]">
                <input
                  type={singleCategory ? 'radio' : 'checkbox'}
                  name="category"
                  checked={categoryIds.includes(c.id)}
                  onChange={() => toggleCategory(c.id)}
                />
                {c.name}
              </label>
            ))}
          </fieldset>

          <button type="submit" disabled={submitting || !roleId || categoryIds.length === 0} className={`${btnPrimary} w-full py-2`}>
            {submitting ? 'Creating…' : 'Create user'}
          </button>
        </form>
      </div>
    </AppShell>
  )
}
