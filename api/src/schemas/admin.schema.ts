import { z } from 'zod'

export const createUserSchema = z
  .object({
    email: z.string().email().transform((email) => email.toLowerCase()),
    password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must be at most 72 characters'),
    // ADMIN is deliberately not creatable here — admins come from the seed script only.
    role: z.enum(['AUTHOR', 'REVIEWER']),
    categoryIds: z.array(z.string().uuid()).min(1, 'Pick at least one category').max(50),
  })
  // For now a reviewer works in exactly one category; authors can span several.
  .refine((user) => user.role !== 'REVIEWER' || new Set(user.categoryIds).size === 1, {
    message: 'A reviewer can belong to only one category',
    path: ['categoryIds'],
  })
