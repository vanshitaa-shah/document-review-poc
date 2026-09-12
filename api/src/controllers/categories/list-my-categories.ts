import type { Request, Response } from 'express'
import { prisma } from '../../lib/prisma.js'

// Categories the caller belongs to — feeds the "new document" category picker.
// Membership is the query predicate itself, not a post-fetch filter.
export async function listMyCategories(req: Request, res: Response) {
  const { id: userId } = req.user!

  const categories = await prisma.category.findMany({
    where: { memberships: { some: { userId } } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  res.json({ items: categories })
}
