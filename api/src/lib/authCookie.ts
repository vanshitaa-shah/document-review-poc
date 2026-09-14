import type { Response } from 'express'

export const AUTH_COOKIE_NAME = 'auth_token'

// Matches the JWT's own expiry (see lib/jwt.ts) so the cookie never outlives
// the token it carries. httpOnly keeps it out of reach of JS (and therefore
// XSS); sameSite=lax is enough here since the UI is served same-origin by
// this API (see lib/staticUi.ts) — there's no cross-site form/fetch path
// that needs a stricter setting or a separate CSRF token.
const MAX_AGE_MS = 12 * 60 * 60 * 1000

export function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_MS,
    path: '/',
  })
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE_NAME, { path: '/' })
}
