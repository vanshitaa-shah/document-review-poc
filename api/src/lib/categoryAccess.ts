import type { Prisma } from '@prisma/client'

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
