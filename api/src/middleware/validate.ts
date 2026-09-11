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
    // Express 5's req.query is a read-only computed getter — it cannot be
    // reassigned or mutated in place, so the parsed/coerced result goes here instead.
    if (schemas.query) req.validatedQuery = schemas.query.parse(req.query)
    next()
  }
}
