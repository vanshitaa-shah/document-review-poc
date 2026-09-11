import type { NextFunction, Request, Response } from 'express'
import type { ZodType } from 'zod'

interface Schemas {
  body?: ZodType
  params?: ZodType
  query?: ZodType
}

export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (schemas.body) req.body = schemas.body.parse(req.body)
    if (schemas.params) req.params = schemas.params.parse(req.params)
    if (schemas.query) req.query = schemas.query.parse(req.query)
    next()
  }
}
