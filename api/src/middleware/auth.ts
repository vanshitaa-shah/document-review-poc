import type { NextFunction, Request, Response } from 'express'
import type { UserRole } from '@prisma/client'
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js'
import { verifyAuthToken } from '../lib/jwt.js'

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null

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

export function requireRole(...roles: UserRole[]) {
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
