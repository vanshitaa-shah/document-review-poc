import type { Request, Response } from 'express'
import { prisma } from '../../lib/prisma.ts'

// Categories the caller belongs to — feeds the "new document" category picker.
// Membership is the query predicate itself, not a post-fetch filter.
// An admin belongs to none, and needs every category to place a new user in — it only
// gets names and ids back, never any document.
export async function listMyCategories(req: Request, res: Response) {
  const { id: userId, role } = req.user!

  const categories = await prisma.category.findMany({
    where: role === 'ADMIN' ? {} : { memberships: { some: { userId } } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  res.json({ items: categories })
}
