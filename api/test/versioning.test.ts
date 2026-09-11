import { randomUUID } from 'node:crypto'
import bcrypt from 'bcrypt'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import { signAuthToken } from '../src/lib/jwt.js'

describe('versioning core', () => {
  const suffix = randomUUID().slice(0, 8)

  let categoryId: string
  let authorId: string
  let reviewerId: string
  let authorToken: string
  const documentIds: string[] = []

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('password123', 10)

    const category = await prisma.category.create({
      data: { name: `Versioning ${suffix}` },
    })
    categoryId = category.id

    const author = await prisma.user.create({
      data: { email: `versioning-author-${suffix}@example.com`, passwordHash, role: 'AUTHOR' },
    })
    const reviewer = await prisma.user.create({
      data: { email: `versioning-reviewer-${suffix}@example.com`, passwordHash, role: 'REVIEWER' },
    })
    authorId = author.id
    reviewerId = reviewer.id

    await prisma.categoryMembership.createMany({
      data: [
        { userId: authorId, categoryId },
        { userId: reviewerId, categoryId },
      ],
    })

    authorToken = signAuthToken({ sub: authorId, role: 'AUTHOR' })
  })

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { documentId: { in: documentIds } } })
    await prisma.review.deleteMany({ where: { version: { documentId: { in: documentIds } } } })
    await prisma.documentVersion.deleteMany({ where: { documentId: { in: documentIds } } })
    await prisma.document.deleteMany({ where: { id: { in: documentIds } } })
    await prisma.categoryMembership.deleteMany({ where: { categoryId } })
    await prisma.user.deleteMany({ where: { id: { in: [authorId, reviewerId] } } })
    await prisma.category.deleteMany({ where: { id: categoryId } })
  })

  async function createDocument(title: string) {
    const res = await request(app)
      .post('/documents')
      .set('Authorization', `Bearer ${authorToken}`)
      .field('title', title)
      .field('categoryId', categoryId)
      .attach('file', Buffer.from('v1 content'), 'v1.txt')

    expect(res.status).toBe(201)
    documentIds.push(res.body.id)
    return res.body as { id: string; currentVersion: { id: string; versionNumber: number } }
  }

  it('supersedes the current version and cancels its pending review in one transaction', async () => {
    const document = await createDocument('Supersession chain')
    const v1 = document.currentVersion

    const review = await prisma.review.create({
      data: { versionId: v1.id, reviewerId, status: 'PENDING' },
    })

    const res = await request(app)
      .post(`/documents/${document.id}/versions`)
      .set('Authorization', `Bearer ${authorToken}`)
      .attach('file', Buffer.from('v2 content'), 'v2.txt')

    expect(res.status).toBe(201)
    expect(res.body.versionNumber).toBe(2)
    expect(res.body.isCurrent).toBe(true)

    const oldVersion = await prisma.documentVersion.findUniqueOrThrow({ where: { id: v1.id } })
    expect(oldVersion.isCurrent).toBe(false)
    expect(oldVersion.status).toBe('SUPERSEDED')

    const cancelledReview = await prisma.review.findUniqueOrThrow({ where: { id: review.id } })
    expect(cancelledReview.status).toBe('SUPERSEDED')
    expect(cancelledReview.decidedAt).not.toBeNull()

    const currentVersions = await prisma.documentVersion.count({
      where: { documentId: document.id, isCurrent: true },
    })
    expect(currentVersions).toBe(1)

    const auditActions = (
      await prisma.auditEvent.findMany({
        where: { documentId: document.id },
        orderBy: { timestamp: 'asc' },
      })
    ).map((e) => e.action)
    expect(auditActions).toEqual([
      'DOCUMENT_CREATED',
      'VERSION_SUPERSEDED',
      'REVIEW_CANCELLED',
      'VERSION_UPLOADED',
    ])
  })

  it('returns the full version chain from history, newest first', async () => {
    const document = await createDocument('History chain')

    await request(app)
      .post(`/documents/${document.id}/versions`)
      .set('Authorization', `Bearer ${authorToken}`)
      .attach('file', Buffer.from('v2 content'), 'v2.txt')

    const res = await request(app)
      .get(`/documents/${document.id}/versions`)
      .set('Authorization', `Bearer ${authorToken}`)

    expect(res.status).toBe(200)
    expect(res.body.items.map((v: { versionNumber: number }) => v.versionNumber)).toEqual([2, 1])
    expect(res.body.items[0].status).toBe('DRAFT')
    expect(res.body.items[0].isCurrent).toBe(true)
    expect(res.body.items[1].status).toBe('SUPERSEDED')
    expect(res.body.items[1].isCurrent).toBe(false)
    expect(res.body.items[0].uploadedBy.id).toBe(authorId)
  })

  it('handles concurrent revision uploads without a 500, and without two current versions', async () => {
    const document = await createDocument('Concurrent revisions')

    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/documents/${document.id}/versions`)
        .set('Authorization', `Bearer ${authorToken}`)
        .attach('file', Buffer.from('race a'), 'race-a.txt'),
      request(app)
        .post(`/documents/${document.id}/versions`)
        .set('Authorization', `Bearer ${authorToken}`)
        .attach('file', Buffer.from('race b'), 'race-b.txt'),
    ])

    expect(resA.status).toBe(201)
    expect(resB.status).toBe(201)

    const versionNumbers = [resA.body.versionNumber, resB.body.versionNumber].sort()
    expect(versionNumbers).toEqual([2, 3])

    const currentVersions = await prisma.documentVersion.findMany({
      where: { documentId: document.id, isCurrent: true },
    })
    expect(currentVersions).toHaveLength(1)
    expect(currentVersions[0]!.versionNumber).toBe(3)
  })

  it('rejects a second concurrent current version at the database', async () => {
    const document = await createDocument('Index enforcement')

    await expect(
      prisma.documentVersion.create({
        data: {
          documentId: document.id,
          versionNumber: 2,
          filePath: '/tmp/dup',
          fileName: 'dup.txt',
          mimeType: 'text/plain',
          size: 3,
          sha256: 'dup',
          uploadedById: authorId,
          isCurrent: true,
          status: 'DRAFT',
        },
      }),
    ).rejects.toThrow()
  })
})
