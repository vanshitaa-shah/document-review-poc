import type { NextFunction, Request, Response } from 'express'
import { AUTH_COOKIE_NAME } from '../lib/authCookie.ts'
import { UnauthorizedError, ForbiddenError } from '../lib/errors.ts'
import { verifyAuthToken } from '../lib/jwt.ts'
import type { RoleName } from '../lib/roles.ts'

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token: string | undefined = req.cookies?.[AUTH_COOKIE_NAME]

  if (!token) {
    throw new UnauthorizedError()
  }

  try {
    const payload = verifyAuthToken(token)
    req.user = { id: payload.sub, role: payload.role }
    next()
  } catch {
    throw new UnauthorizedError('Invalid or expired token')
  }
}

export function requireRole(...roles: RoleName[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthorizedError()
    }
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError()
    }
    next()
  }
}
