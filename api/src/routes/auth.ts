import { Router } from 'express'
import { validate } from '../middleware/validate.js'
import { login } from '../controllers/auth/login.js'
import { loginSchema } from '../schemas/auth.schema.js'

export const authRouter = Router()

// Exchanges email + password for a JWT.
authRouter.post('/login', validate({ body: loginSchema }), login)
