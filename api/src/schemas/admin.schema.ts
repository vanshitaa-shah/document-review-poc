import { z } from 'zod'

// Admins come from the seed script only, so this role can never be assigned through the API.
export const NON_ASSIGNABLE_ROLE = 'ADMIN'

export const createUserSchema = z
  .object({
    email: z.string().email().transform((email) => email.toLowerCase()),
    password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must be at most 72 characters'),
    // Id of a row in the Role table (existence and ADMIN are checked in the controller).
    roleId: z.string().uuid('Pick a role'),
    categoryIds: z.array(z.string().uuid()).min(1, 'Pick at least one category').max(50),
  })
