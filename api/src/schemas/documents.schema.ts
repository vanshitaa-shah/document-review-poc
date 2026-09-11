import { z } from 'zod'

export const paramsSchema = z.object({ id: z.string().uuid() })

export const createDocumentSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  categoryId: z.string().uuid(),
})

export const versionsQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})
