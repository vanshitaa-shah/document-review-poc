import { randomUUID } from 'node:crypto'
import bcrypt from 'bcrypt'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import { signAuthToken } from '../src/lib/jwt.js'

describe('category isolation', () => {
  const suffix = randomUUID().slice(0, 8)

  let memberCategoryId: string
  let outsiderCategoryId: string
  let authorId: string
  let memberReviewerId: string
  let outsiderReviewerId: string
  let documentId: string
  let memberToken: string
  let outsiderToken: string

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('password123', 10)

    const memberCategory = await prisma.category.create({
      data: { name: `Isolation Member ${suffix}` },
    })
    const outsiderCategory = await prisma.category.create({
      data: { name: `Isolation Outsider ${suffix}` },
    })
    memberCategoryId = memberCategory.id
    outsiderCategoryId = outsiderCategory.id

    const author = await prisma.user.create({
      data: { email: `author-${suffix}@example.com`, passwordHash, role: 'AUTHOR' },
    })
    const memberReviewer = await prisma.user.create({
      data: { email: `member-${suffix}@example.com`, passwordHash, role: 'REVIEWER' },
    })
    const outsiderReviewer = await prisma.user.create({
      data: { email: `outsider-${suffix}@example.com`, passwordHash, role: 'REVIEWER' },
    })
    authorId = author.id
    memberReviewerId = memberReviewer.id
    outsiderReviewerId = outsiderReviewer.id

    await prisma.categoryMembership.create({
      data: { userId: authorId, categoryId: memberCategoryId },
    })
    await prisma.categoryMembership.create({
      data: { userId: memberReviewerId, categoryId: memberCategoryId },
    })
    await prisma.categoryMembership.create({
      data: { userId: outsiderReviewerId, categoryId: outsiderCategoryId },
    })

    const document = await prisma.document.create({
      data: { title: `Isolation doc ${suffix}`, categoryId: memberCategoryId, authorId },
    })
    documentId = document.id

    memberToken = signAuthToken({ sub: memberReviewerId, role: 'REVIEWER' })
    outsiderToken = signAuthToken({ sub: outsiderReviewerId, role: 'REVIEWER' })
  })

  afterAll(async () => {
    await prisma.document.deleteMany({ where: { id: documentId } })
    await prisma.categoryMembership.deleteMany({
      where: { categoryId: { in: [memberCategoryId, outsiderCategoryId] } },
    })
    await prisma.user.deleteMany({
      where: { id: { in: [authorId, memberReviewerId, outsiderReviewerId] } },
    })
    await prisma.category.deleteMany({
      where: { id: { in: [memberCategoryId, outsiderCategoryId] } },
    })
  })

  it('lets a category member load the document', async () => {
    const res = await request(app)
      .get(`/documents/${documentId}`)
      .set('Authorization', `Bearer ${memberToken}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(documentId)
  })

  it('never loads the row for a non-member, even by direct id', async () => {
    const res = await request(app)
      .get(`/documents/${documentId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)

    expect(res.status).toBe(404)
  })

  it('rejects requests with no token', async () => {
    const res = await request(app).get(`/documents/${documentId}`)

    expect(res.status).toBe(401)
  })
})
