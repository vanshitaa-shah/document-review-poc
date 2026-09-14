import { Router } from 'express'
import { validate } from '../middleware/validate.js'
import { login } from '../controllers/auth/login.js'
import { logout } from '../controllers/auth/logout.js'
import { loginSchema } from '../schemas/auth.schema.js'

export const authRouter = Router()

// Exchanges email + password for an httpOnly auth cookie.
authRouter.post('/login', validate({ body: loginSchema }), login)

// Clears the auth cookie.
authRouter.post('/logout', logout)
