import type { Request, Response } from 'express'
import { clearAuthCookie } from '../../lib/authCookie.js'

// An httpOnly cookie can't be cleared by client-side JS — the browser has to
// be told to drop it via Set-Cookie. Works even with no/expired cookie, so
// no auth requirement here.
export function logout(_req: Request, res: Response) {
  clearAuthCookie(res)
  res.status(204).send()
}
