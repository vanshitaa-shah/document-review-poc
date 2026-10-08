import type { Request, Response } from 'express'
import { prisma } from '../../lib/prisma.ts'
import { NON_ASSIGNABLE_ROLE } from '../../schemas/admin.schema.ts'

// The roles an admin can give a new user, read from the Role table (ADMIN is excluded).
export async function listRoles(_req: Request, res: Response) {
  const items = await prisma.role.findMany({
    where: { name: { not: NON_ASSIGNABLE_ROLE } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
  res.json({ items })
}
