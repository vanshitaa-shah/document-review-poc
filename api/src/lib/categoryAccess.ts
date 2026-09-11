import type { Prisma } from '@prisma/client'
import { prisma } from './prisma.js'

/**
 * Bakes category membership into the query itself so a non-member's row
 * never loads — never fetch first and check membership in JS.
 */
export function documentCategoryFilter(userId: string): Prisma.DocumentWhereInput {
  return { category: { memberships: { some: { userId } } } }
}

export function documentVersionCategoryFilter(userId: string): Prisma.DocumentVersionWhereInput {
  return { document: { category: { memberships: { some: { userId } } } } }
}

export async function isCategoryMember(userId: string, categoryId: string): Promise<boolean> {
  const membership = await prisma.categoryMembership.findUnique({
    where: { userId_categoryId: { userId, categoryId } },
  })
  return membership !== null
}

/**
 * Category membership is necessary but not sufficient: a DRAFT document is only
 * visible to its own author, never to other category members. Submitted (and
 * later) documents are visible to everyone in the category.
 */
export function documentVisibilityFilter(userId: string): Prisma.DocumentWhereInput {
  return {
    ...documentCategoryFilter(userId),
    OR: [{ authorId: userId }, { versions: { some: { isCurrent: true, status: { not: 'DRAFT' } } } }],
  }
}
