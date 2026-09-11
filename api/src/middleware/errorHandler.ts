import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { ZodError } from 'zod'
import { AppError } from '../lib/errors.js'

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Invalid request', details: err.flatten() })
    return
  }

  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.message })
    return
  }

  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message })
    return
  }

  res.req.log?.error({ err }, 'unhandled error')
  res.status(500).json({ error: 'Internal server error' })
}
