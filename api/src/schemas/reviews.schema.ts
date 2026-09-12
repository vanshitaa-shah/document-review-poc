import { z } from 'zod'

export const versionParamsSchema = z.object({ versionId: z.string().uuid() })

export const versionIdParamSchema = z.object({ id: z.string().uuid() })

export const requestChangesBodySchema = z.object({
  comment: z.string().min(1, 'Comment is required'),
})

export const queueQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})
