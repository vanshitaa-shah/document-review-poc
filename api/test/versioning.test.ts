import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import { createFixtures, type TestActor } from './support/fixtures.js'
import { createDocument, uploadRevision } from './support/http.js'

describe('versioning core', () => {
  const fixtures = createFixtures('Versioning')
  const { documentIds } = fixtures

  let categoryId: string
  let author: TestActor
  let reviewer: TestActor

  beforeAll(async () => {
    categoryId = await fixtures.category('Primary')
    author = await fixtures.actor('AUTHOR', 'author', categoryId)
    reviewer = await fixtures.actor('REVIEWER', 'reviewer', categoryId)
  })

  afterAll(fixtures.cleanup)

  async function document(title: string) {
    const doc = await createDocument(author.token, { title, categoryId, content: 'v1 content' })
    documentIds.push(doc.id)
    return doc
  }

  it('supersedes the current version and cancels its pending review in one transaction', async () => {
    const doc = await document('Supersession chain')
    const v1 = doc.currentVersion

    const review = await prisma.review.create({
      data: { versionId: v1.id, reviewerId: reviewer.id, status: 'PENDING' },
    })

    const res = await uploadRevision(author.token, doc.id)

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
      where: { documentId: doc.id, isCurrent: true },
    })
    expect(currentVersions).toBe(1)

    const auditActions = (
      await prisma.auditEvent.findMany({
        where: { documentId: doc.id },
        orderBy: { timestamp: 'asc' },
      })
    ).map((e) => e.action)
    expect(auditActions).toEqual([
      'DOCUMENT_UPLOADED',
      'VERSION_SUPERSEDED',
      'REVIEW_CANCELLED',
      'VERSION_UPLOADED',
    ])
  })

  it('returns the full version chain from history, newest first', async () => {
    const doc = await document('History chain')

    await uploadRevision(author.token, doc.id)

    const res = await request(app)
      .get(`/documents/${doc.id}/versions`)
      .set('Cookie', `auth_token=${author.token}`)

    expect(res.status).toBe(200)
    expect(res.body.items.map((v: { versionNumber: number }) => v.versionNumber)).toEqual([2, 1])
    expect(res.body.items[0].status).toBe('DRAFT')
    expect(res.body.items[0].isCurrent).toBe(true)
    expect(res.body.items[1].status).toBe('SUPERSEDED')
    expect(res.body.items[1].isCurrent).toBe(false)
    expect(res.body.items[0].uploadedBy.id).toBe(author.id)
  })

  it('handles concurrent revision uploads without a 500, and without two current versions', async () => {
    const doc = await document('Concurrent revisions')

    const [resA, resB] = await Promise.all([
      uploadRevision(author.token, doc.id, { fileName: 'race-a.txt', content: 'race a' }),
      uploadRevision(author.token, doc.id, { fileName: 'race-b.txt', content: 'race b' }),
    ])

    expect(resA.status).toBe(201)
    expect(resB.status).toBe(201)

    const versionNumbers = [resA.body.versionNumber, resB.body.versionNumber].sort()
    expect(versionNumbers).toEqual([2, 3])

    const currentVersions = await prisma.documentVersion.findMany({
      where: { documentId: doc.id, isCurrent: true },
    })
    expect(currentVersions).toHaveLength(1)
    expect(currentVersions[0]!.versionNumber).toBe(3)
  })

  it('rejects a second concurrent current version at the database', async () => {
    const doc = await document('Index enforcement')

    await expect(
      prisma.documentVersion.create({
        data: {
          documentId: doc.id,
          versionNumber: 2,
          filePath: '/tmp/dup',
          fileName: 'dup.txt',
          mimeType: 'text/plain',
          size: 3,
          sha256: 'dup',
          uploadedById: author.id,
          isCurrent: true,
          status: 'DRAFT',
        },
      }),
    ).rejects.toThrow()
  })
})
