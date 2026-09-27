import { randomUUID } from 'node:crypto'
import type { UserRole } from '@prisma/client'
import bcrypt from 'bcrypt'
import { prisma } from '../../src/lib/prisma.js'
import { signAuthToken } from '../../src/lib/jwt.js'

export const TEST_PASSWORD = 'password123'

export type Role = UserRole

export interface TestActor {
  id: string
  email: string
  token: string
}

export interface TestFixtures {
  /** Random per-suite-run tag, so parallel suites never collide on unique fields (email, category name). */
  suffix: string
  /** Push every document id a test creates here — cleanup() tears them down for you. */
  documentIds: string[]
  category(label: string): Promise<string>
  actor(role: Role, label: string, categoryId: string): Promise<TestActor>
  cleanup(): Promise<void>
}

/**
 * Per-suite factory for categories, users and category memberships used by
 * (almost) every test file's beforeAll/afterAll. `cleanup()` deletes across
 * the full set of tables a document can touch, in FK-safe order, regardless
 * of which ones a given suite actually used — deleting zero rows from an
 * unused table is a no-op, so one order works for every suite.
 */
export function createFixtures(prefix: string): TestFixtures {
  const suffix = randomUUID().slice(0, 8)
  const documentIds: string[] = []
  const categoryIds: string[] = []
  const userIds: string[] = []
  let hash: Promise<string> | undefined

  function passwordHash(): Promise<string> {
    hash ??= bcrypt.hash(TEST_PASSWORD, 10)
    return hash
  }

  async function category(label: string): Promise<string> {
    const created = await prisma.category.create({ data: { name: `${prefix} ${label} ${suffix}` } })
    categoryIds.push(created.id)
    return created.id
  }

  async function actor(role: Role, label: string, categoryId: string): Promise<TestActor> {
    const email = `${prefix.toLowerCase()}-${label}-${suffix}@example.com`
    const user = await prisma.user.create({
      data: { email, passwordHash: await passwordHash(), role },
    })
    userIds.push(user.id)
    await prisma.categoryMembership.create({ data: { userId: user.id, categoryId } })
    return { id: user.id, email, token: signAuthToken({ sub: user.id, role }) }
  }

  async function cleanup(): Promise<void> {
    await prisma.comment.deleteMany({ where: { version: { documentId: { in: documentIds } } } })
    await prisma.auditEvent.deleteMany({ where: { documentId: { in: documentIds } } })
    await prisma.approval.deleteMany({ where: { version: { documentId: { in: documentIds } } } })
    await prisma.review.deleteMany({ where: { version: { documentId: { in: documentIds } } } })
    await prisma.documentVersion.deleteMany({ where: { documentId: { in: documentIds } } })
    await prisma.document.deleteMany({ where: { id: { in: documentIds } } })
    await prisma.categoryMembership.deleteMany({ where: { categoryId: { in: categoryIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } })
  }

  return { suffix, documentIds, category, actor, cleanup }
}
