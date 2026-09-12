import type { Prisma, UserRole } from '@prisma/client'
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
 * Category membership is necessary but not sufficient:
 * - An AUTHOR only ever sees their own documents (draft or submitted) — never
 *   another author's work in the same category.
 * - A REVIEWER sees every submitted (or later) document in their categories,
 *   but never a DRAFT — drafts are only visible to the author who owns them.
 */
export function documentVisibilityFilter(userId: string, role: UserRole): Prisma.DocumentWhereInput {
  if (role === 'AUTHOR') {
    return { ...documentCategoryFilter(userId), authorId: userId }
  }
  return {
    ...documentCategoryFilter(userId),
    versions: { some: { isCurrent: true, status: { not: 'DRAFT' } } },
  }
}
