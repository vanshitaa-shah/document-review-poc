// Thin typed fetch wrapper. Attaches the bearer token, parses the server's
// { error, details? } body on failure, and throws it as an ApiError so callers
// (and the shared error display) can show the server's message verbatim.
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
  token?: string | null
  signal?: AbortSignal
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  // FormData sets its own multipart boundary — never stamp a Content-Type on it.
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`
  }

  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    ...(options.formData ? { body: options.formData } : {}),
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
    ...(options.signal && { signal: options.signal }),
  })

  // Only an authenticated call going stale should redirect to login — a login
  // attempt itself rejecting with 401 is just "wrong credentials".
  if (res.status === 401 && options.token) {
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
  get: <T>(path: string, token: string | null, signal?: AbortSignal) =>
    request<T>(path, { method: 'GET', token, ...(signal && { signal }) }),
  post: <T>(path: string, body: unknown, token: string | null) =>
    request<T>(path, { method: 'POST', body, token }),
  postForm: <T>(path: string, formData: FormData, token: string | null) =>
    request<T>(path, { method: 'POST', formData, token }),
}
