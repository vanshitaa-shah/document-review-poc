import { execSync } from 'node:child_process'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

// Run on every boot, dev and production alike. A fresh clone/volume has zero
// users, so it gets seeded; a live database with real accounts is never
// touched — this only ever fires once, on an empty database.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })
const userCount = await prisma.user.count()
await prisma.$disconnect()

if (userCount === 0) {
  execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' })
}
