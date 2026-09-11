import { Router } from 'express'
import { validate } from '../middleware/validate.js'
import { login, loginSchema } from '../controllers/auth.controller.js'

export const authRouter = Router()

authRouter.post('/login', validate({ body: loginSchema }), login)
