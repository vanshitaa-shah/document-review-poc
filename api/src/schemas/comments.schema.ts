import { z } from 'zod'

// Every comment is anchored to a highlighted passage — quote, surrounding
// context, and character offsets are all required. There is no version-level
// (generic) comment anymore: a reviewer always highlights the text they're
// commenting on.
export const createCommentSchema = z.object({
  body: z.string().min(1, 'Comment body is required'),
  anchorQuote: z.string().min(1, 'Highlighted text is required'),
  anchorPrefix: z.string().optional(),
  anchorSuffix: z.string().optional(),
  anchorStart: z.number().int().nonnegative(),
  anchorEnd: z.number().int().nonnegative(),
})

export const commentsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})
