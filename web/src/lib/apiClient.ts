// Thin typed fetch wrapper. Auth is an httpOnly cookie the browser attaches
// on its own (credentials: 'include') — the client never touches the token.
// Parses the server's { error, details? } body on failure and throws it as
// an ApiError so callers (and the shared error display) can show the
// server's message verbatim.
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export type Unauthorized = () => void

let onUnauthorized: Unauthorized | null = null

// Registered once by AuthProvider so a 401 from any call can redirect to login.
export function setUnauthorizedHandler(handler: Unauthorized | null) {
  onUnauthorized = handler
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  formData?: FormData
  signal?: AbortSignal
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  // FormData sets its own multipart boundary — never stamp a Content-Type on it.
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    ...(options.formData ? { body: options.formData } : {}),
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
    ...(options.signal && { signal: options.signal }),
  })

  // Only an already-authenticated call going stale should redirect to login —
  // the login request itself rejecting with 401 is just "wrong credentials".
  if (res.status === 401 && path !== '/auth/login') {
    onUnauthorized?.()
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: res.statusText }))
    throw new ApiError(payload.error ?? 'Request failed', res.status, payload.details)
  }

  if (res.status === 204) {
    return undefined as T
  }

  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'GET', ...(signal && { signal }) }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  postForm: <T>(path: string, formData: FormData) => request<T>(path, { method: 'POST', formData }),
}
