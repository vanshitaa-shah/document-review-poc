import type { Request, Response } from 'express'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { signAuthToken } from '../lib/jwt.js'
import { UnauthorizedError } from '../lib/errors.js'

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
})

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

  res.json({
    token,
    user: { id: user.id, email: user.email, role: user.role },
  })
}
