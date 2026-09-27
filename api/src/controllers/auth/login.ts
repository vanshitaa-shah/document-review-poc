import type { Request, Response } from 'express'
import bcrypt from 'bcrypt'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.ts'
import { setAuthCookie } from '../../lib/authCookie.ts'
import { signAuthToken } from '../../lib/jwt.ts'
import { UnauthorizedError } from '../../lib/errors.ts'
import { loginSchema } from '../../schemas/auth.schema.ts'

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as z.infer<typeof loginSchema>

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    throw new UnauthorizedError('Invalid email or password')
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash)
  if (!passwordMatches) {
    throw new UnauthorizedError('Invalid email or password')
  }

  const token = signAuthToken({ sub: user.id, role: user.role })
  setAuthCookie(res, token)

  res.json({
    user: { id: user.id, email: user.email, role: user.role },
  })
}
