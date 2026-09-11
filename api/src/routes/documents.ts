import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { documentCategoryFilter } from '../lib/categoryAccess.js'
import { NotFoundError } from '../lib/errors.js'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'

export const documentsRouter = Router()

const paramsSchema = z.object({ id: z.string().uuid() })

documentsRouter.get(
  '/:id',
  requireAuth,
  validate({ params: paramsSchema }),
  async (req, res) => {
    const { id } = req.params as z.infer<typeof paramsSchema>
    const { id: userId } = req.user!

    const document = await prisma.document.findFirst({
      where: { id, ...documentCategoryFilter(userId) },
    })

    if (!document) {
      throw new NotFoundError()
    }

    res.json(document)
  },
)
