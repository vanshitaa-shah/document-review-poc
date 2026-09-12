import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10)

  const [engineering, marketing] = await Promise.all([
    prisma.category.upsert({
      where: { name: 'Engineering' },
      update: {},
      create: { name: 'Engineering' },
    }),
    prisma.category.upsert({
      where: { name: 'Marketing' },
      update: {},
      create: { name: 'Marketing' },
    }),
  ])

  // 3 authors, members of both categories so any of them can create a document
  // in either — the interesting split for testing is on the reviewer side.
  const authors = await Promise.all(
    [1, 2, 3].map((n) =>
      prisma.user.upsert({
        where: { email: `author${n}@example.com` },
        update: {},
        create: { email: `author${n}@example.com`, passwordHash, role: 'AUTHOR' },
      }),
    ),
  )

  // 7 reviewers: 3 scoped to Engineering, 4 scoped to Marketing — so category
  // isolation (a reviewer never sees the other category's documents) is
  // actually exercisable by hand, not just in the automated tests.
  const engineeringReviewers = await Promise.all(
    [1, 2, 3].map((n) =>
      prisma.user.upsert({
        where: { email: `reviewer${n}@example.com` },
        update: {},
        create: { email: `reviewer${n}@example.com`, passwordHash, role: 'REVIEWER' },
      }),
    ),
  )
  const marketingReviewers = await Promise.all(
    [4, 5, 6, 7].map((n) =>
      prisma.user.upsert({
        where: { email: `reviewer${n}@example.com` },
        update: {},
        create: { email: `reviewer${n}@example.com`, passwordHash, role: 'REVIEWER' },
      }),
    ),
  )

  const memberships: Array<[string, string]> = [
    ...authors.flatMap((a): Array<[string, string]> => [
      [a.id, engineering.id],
      [a.id, marketing.id],
    ]),
    ...engineeringReviewers.map((r): [string, string] => [r.id, engineering.id]),
    ...marketingReviewers.map((r): [string, string] => [r.id, marketing.id]),
  ]

  for (const [userId, categoryId] of memberships) {
    await prisma.categoryMembership.upsert({
      where: { userId_categoryId: { userId, categoryId } },
      update: {},
      create: { userId, categoryId },
    })
  }

  console.log('Seed complete:')
  console.log({
    categories: { engineering: engineering.name, marketing: marketing.name },
    authors: authors.map((a) => a.email),
    engineeringReviewers: engineeringReviewers.map((r) => r.email),
    marketingReviewers: marketingReviewers.map((r) => r.email),
    password: 'password123',
  })
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
