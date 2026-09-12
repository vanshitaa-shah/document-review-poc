import { randomUUID } from 'node:crypto'
import bcrypt from 'bcrypt'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import { signAuthToken } from '../src/lib/jwt.js'

describe('audit trail', () => {
  const suffix = randomUUID().slice(0, 8)

  let categoryId: string
  let otherCategoryId: string
  let authorId: string
  let reviewerId: string
  let outsiderId: string
  let authorToken: string
  let reviewerToken: string
  let outsiderToken: string
  const documentIds: string[] = []

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('password123', 10)

    const category = await prisma.category.create({ data: { name: `Audit ${suffix}` } })
    const otherCategory = await prisma.category.create({ data: { name: `Audit Other ${suffix}` } })
    categoryId = category.id
    otherCategoryId = otherCategory.id

    const author = await prisma.user.create({
      data: { email: `audit-author-${suffix}@example.com`, passwordHash, role: 'AUTHOR' },
    })
    const reviewer = await prisma.user.create({
      data: { email: `audit-reviewer-${suffix}@example.com`, passwordHash, role: 'REVIEWER' },
    })
    const outsider = await prisma.user.create({
      data: { email: `audit-outsider-${suffix}@example.com`, passwordHash, role: 'REVIEWER' },
    })
    authorId = author.id
    reviewerId = reviewer.id
    outsiderId = outsider.id

    await prisma.categoryMembership.createMany({
      data: [
        { userId: authorId, categoryId },
        { userId: reviewerId, categoryId },
        { userId: outsiderId, categoryId: otherCategoryId },
      ],
    })

    authorToken = signAuthToken({ sub: authorId, role: 'AUTHOR' })
    reviewerToken = signAuthToken({ sub: reviewerId, role: 'REVIEWER' })
    outsiderToken = signAuthToken({ sub: outsiderId, role: 'REVIEWER' })
  })

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { documentId: { in: documentIds } } })
    await prisma.approval.deleteMany({ where: { version: { documentId: { in: documentIds } } } })
    await prisma.review.deleteMany({ where: { version: { documentId: { in: documentIds } } } })
    await prisma.documentVersion.deleteMany({ where: { documentId: { in: documentIds } } })
    await prisma.document.deleteMany({ where: { id: { in: documentIds } } })
    await prisma.categoryMembership.deleteMany({
      where: { categoryId: { in: [categoryId, otherCategoryId] } },
    })
    await prisma.user.deleteMany({ where: { id: { in: [authorId, reviewerId, outsiderId] } } })
    await prisma.category.deleteMany({ where: { id: { in: [categoryId, otherCategoryId] } } })
  })

  it('records one row per tracked action, newest first, and hides it from non-members', async () => {
    const create = await request(app)
      .post('/documents')
      .set('Authorization', `Bearer ${authorToken}`)
      .field('title', 'Audited document')
      .field('categoryId', categoryId)
      .attach('file', Buffer.from('v1 content'), 'v1.txt')
    const documentId = create.body.id as string
    const v1VersionId = create.body.currentVersion.id as string
    documentIds.push(documentId)

    await request(app).post(`/documents/${documentId}/submit`).set('Authorization', `Bearer ${authorToken}`)

    await request(app)
      .post(`/versions/${v1VersionId}/request-changes`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ comment: 'fix the intro' })

    await request(app)
      .post(`/documents/${documentId}/versions`)
      .set('Authorization', `Bearer ${authorToken}`)
      .attach('file', Buffer.from('v2 content'), 'v2.txt')

    const res = await request(app)
      .get(`/documents/${documentId}/audit`)
      .set('Authorization', `Bearer ${authorToken}`)

    expect(res.status).toBe(200)
    const actions = res.body.items.map((e: { action: string }) => e.action)
    expect(actions).toEqual([
      'VERSION_UPLOADED',
      'VERSION_SUPERSEDED',
      'CHANGES_REQUESTED',
      'SUBMITTED',
      'DOCUMENT_UPLOADED',
    ])

    const timestamps = res.body.items.map((e: { timestamp: string }) => new Date(e.timestamp).getTime())
    expect([...timestamps].sort((a, b) => b - a)).toEqual(timestamps)

    const refused = await request(app)
      .get(`/documents/${documentId}/audit`)
      .set('Authorization', `Bearer ${outsiderToken}`)
    expect(refused.status).toBe(404)
  })

  it('paginates the audit trail by cursor', async () => {
    const create = await request(app)
      .post('/documents')
      .set('Authorization', `Bearer ${authorToken}`)
      .field('title', 'Long audit trail')
      .field('categoryId', categoryId)
      .attach('file', Buffer.from('v1 content'), 'v1.txt')
    const documentId = create.body.id as string
    documentIds.push(documentId)

    await request(app).post(`/documents/${documentId}/submit`).set('Authorization', `Bearer ${authorToken}`)
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post(`/documents/${documentId}/versions`)
        .set('Authorization', `Bearer ${authorToken}`)
        .attach('file', Buffer.from(`v${i + 2} content`), `v${i + 2}.txt`)
    }

    const firstPage = await request(app)
      .get(`/documents/${documentId}/audit?limit=2`)
      .set('Authorization', `Bearer ${authorToken}`)
    expect(firstPage.body.items).toHaveLength(2)
    expect(firstPage.body.nextCursor).not.toBeNull()

    const secondPage = await request(app)
      .get(`/documents/${documentId}/audit?limit=2&cursor=${firstPage.body.nextCursor}`)
      .set('Authorization', `Bearer ${authorToken}`)
    expect(secondPage.body.items).toHaveLength(2)

    const firstIds = firstPage.body.items.map((e: { id: string }) => e.id)
    const secondIds = secondPage.body.items.map((e: { id: string }) => e.id)
    expect(firstIds.some((id: string) => secondIds.includes(id))).toBe(false)
  })
})
