import type { UserRole } from '@prisma/client'

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        role: UserRole
      }
      // Set by the validate middleware — req.query itself is a read-only
      // computed getter in Express 5 and cannot carry parsed/coerced values.
      // Typed `unknown`, not a shape, so every controller must narrow it with
      // its own schema's z.infer before use — see getValidatedQuery().
      validatedQuery?: unknown
    }
  }
}

export {}
