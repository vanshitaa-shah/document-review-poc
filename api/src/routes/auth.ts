import { Router } from 'express'
import { validate } from '../middleware/validate.ts'
import { loginLimiter } from '../lib/rateLimit.ts'
import { login } from '../controllers/auth/login.ts'
import { logout } from '../controllers/auth/logout.ts'
import { loginSchema } from '../schemas/auth.schema.ts'

export const authRouter = Router()

// Exchanges email + password for an httpOnly auth cookie.
authRouter.post('/login', loginLimiter, validate({ body: loginSchema }), login)

// Clears the auth cookie.
authRouter.post('/logout', logout)
