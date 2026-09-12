import { z } from 'zod'

// Anchor fields are all-or-nothing: a highlighted comment carries quote+start+end
// together, a version-level comment (the PDF fallback) carries none of them.
export const createCommentSchema = z
  .object({
    body: z.string().min(1, 'Comment body is required'),
    anchorQuote: z.string().min(1).optional(),
    anchorPrefix: z.string().optional(),
    anchorSuffix: z.string().optional(),
    anchorStart: z.number().int().nonnegative().optional(),
    anchorEnd: z.number().int().nonnegative().optional(),
  })
  .refine(
    (data) => {
      const anchorGiven = [data.anchorQuote, data.anchorStart, data.anchorEnd]
      const allGiven = anchorGiven.every((f) => f !== undefined)
      const noneGiven = anchorGiven.every((f) => f === undefined)
      return allGiven || noneGiven
    },
    { message: 'anchorQuote, anchorStart and anchorEnd must be given together, or not at all' },
  )

export const commentsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})
