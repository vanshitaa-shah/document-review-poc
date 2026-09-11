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

  const author = await prisma.user.upsert({
    where: { email: 'author@example.com' },
    update: {},
    create: { email: 'author@example.com', passwordHash, role: 'AUTHOR' },
  })

  const reviewerOne = await prisma.user.upsert({
    where: { email: 'reviewer1@example.com' },
    update: {},
    create: { email: 'reviewer1@example.com', passwordHash, role: 'REVIEWER' },
  })

  const reviewerTwo = await prisma.user.upsert({
    where: { email: 'reviewer2@example.com' },
    update: {},
    create: { email: 'reviewer2@example.com', passwordHash, role: 'REVIEWER' },
  })

  const memberships: Array<[string, string]> = [
    [author.id, engineering.id],
    [author.id, marketing.id],
    [reviewerOne.id, engineering.id],
    [reviewerTwo.id, marketing.id],
  ]

  for (const [userId, categoryId] of memberships) {
    await prisma.categoryMembership.upsert({
      where: { userId_categoryId: { userId, categoryId } },
      update: {},
      create: { userId, categoryId },
    })
  }

  console.log('Seed complete:')
  console.log({ engineering, marketing, author, reviewerOne, reviewerTwo })
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
