import { randomUUID } from 'node:crypto'
import bcrypt from 'bcrypt'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import { signAuthToken } from '../src/lib/jwt.js'

describe('review, approval, locking', () => {
  const suffix = randomUUID().slice(0, 8)

  let categoryId: string
  let otherCategoryId: string
  let authorId: string
  let reviewerId: string
  let otherReviewerId: string
  let authorToken: string
  let reviewerToken: string
  let otherReviewerToken: string
  const documentIds: string[] = []

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('password123', 10)

    const category = await prisma.category.create({ data: { name: `Reviews ${suffix}` } })
    const otherCategory = await prisma.category.create({ data: { name: `Reviews Other ${suffix}` } })
    categoryId = category.id
    otherCategoryId = otherCategory.id

    const author = await prisma.user.create({
      data: { email: `reviews-author-${suffix}@example.com`, passwordHash, role: 'AUTHOR' },
    })
    const reviewer = await prisma.user.create({
      data: { email: `reviews-reviewer-${suffix}@example.com`, passwordHash, role: 'REVIEWER' },
    })
    const otherReviewer = await prisma.user.create({
      data: { email: `reviews-other-reviewer-${suffix}@example.com`, passwordHash, role: 'REVIEWER' },
    })
    authorId = author.id
    reviewerId = reviewer.id
    otherReviewerId = otherReviewer.id

    await prisma.categoryMembership.createMany({
      data: [
        { userId: authorId, categoryId },
        { userId: reviewerId, categoryId },
        { userId: otherReviewerId, categoryId: otherCategoryId },
      ],
    })

    authorToken = signAuthToken({ sub: authorId, role: 'AUTHOR' })
    reviewerToken = signAuthToken({ sub: reviewerId, role: 'REVIEWER' })
    otherReviewerToken = signAuthToken({ sub: otherReviewerId, role: 'REVIEWER' })
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
    await prisma.user.deleteMany({ where: { id: { in: [authorId, reviewerId, otherReviewerId] } } })
    await prisma.category.deleteMany({ where: { id: { in: [categoryId, otherCategoryId] } } })
  })

  async function createSubmittedDocument(title: string) {
    const create = await request(app)
      .post('/documents')
      .set('Cookie', `auth_token=${authorToken}`)
      .field('title', title)
      .field('categoryId', categoryId)
      .attach('file', Buffer.from('v1 content'), 'v1.txt')
    documentIds.push(create.body.id)

    await request(app)
      .post(`/documents/${create.body.id}/submit`)
      .set('Cookie', `auth_token=${authorToken}`)

    return create.body as { id: string; currentVersion: { id: string } }
  }

  it('shows only current, submitted versions in the reviewer queue', async () => {
    const submitted = await createSubmittedDocument('Queue candidate')

    const draft = await request(app)
      .post('/documents')
      .set('Cookie', `auth_token=${authorToken}`)
      .field('title', 'Still drafting')
      .field('categoryId', categoryId)
      .attach('file', Buffer.from('draft'), 'draft.txt')
    documentIds.push(draft.body.id)

    const res = await request(app).get('/reviews/queue').set('Cookie', `auth_token=${reviewerToken}`)

    expect(res.status).toBe(200)
    const ids = res.body.items.map((v: { id: string }) => v.id)
    expect(ids).toContain(submitted.currentVersion.id)
    expect(ids).not.toContain(draft.body.currentVersion.id)

    const otherCategoryRes = await request(app)
      .get('/reviews/queue')
      .set('Cookie', `auth_token=${otherReviewerToken}`)
    expect(otherCategoryRes.body.items.map((v: { id: string }) => v.id)).not.toContain(
      submitted.currentVersion.id,
    )
  })

  it('approves the current submitted version, writing one approval and one audit row', async () => {
    const document = await createSubmittedDocument('Approve me')
    const versionId = document.currentVersion.id

    const res = await request(app)
      .post(`/versions/${versionId}/approve`)
      .set('Cookie', `auth_token=${reviewerToken}`)
    expect(res.status).toBe(204)

    const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: versionId } })
    expect(version.status).toBe('APPROVED')

    const approval = await prisma.approval.findUnique({ where: { versionId } })
    expect(approval).not.toBeNull()
    expect(approval!.approverId).toBe(reviewerId)

    const auditActions = (
      await prisma.auditEvent.findMany({ where: { versionId }, orderBy: { timestamp: 'asc' } })
    ).map((e) => e.action)
    expect(auditActions).toContain('APPROVED')
  })

  it('rejects approving a superseded version, naming the actual current version, and creates nothing', async () => {
    const document = await createSubmittedDocument('Stale approval')
    const staleVersionId = document.currentVersion.id

    await request(app)
      .post(`/documents/${document.id}/versions`)
      .set('Cookie', `auth_token=${authorToken}`)
      .attach('file', Buffer.from('v2 content'), 'v2.txt')

    const res = await request(app)
      .post(`/versions/${staleVersionId}/approve`)
      .set('Cookie', `auth_token=${reviewerToken}`)

    expect(res.status).toBe(409)
    expect(res.body.error).toContain('v2')

    const approval = await prisma.approval.findUnique({ where: { versionId: staleVersionId } })
    expect(approval).toBeNull()
  })

  it('rejects request-changes without a comment', async () => {
    const document = await createSubmittedDocument('No comment')

    const res = await request(app)
      .post(`/versions/${document.currentVersion.id}/request-changes`)
      .set('Cookie', `auth_token=${reviewerToken}`)
      .send({})

    expect(res.status).toBe(400)
  })

  it('requests changes with a comment, moving the version to CHANGES_REQUESTED', async () => {
    const document = await createSubmittedDocument('Needs changes')
    const versionId = document.currentVersion.id

    const res = await request(app)
      .post(`/versions/${versionId}/request-changes`)
      .set('Cookie', `auth_token=${reviewerToken}`)
      .send({ comment: 'Please fix the typo on page 2' })

    expect(res.status).toBe(204)

    const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: versionId } })
    expect(version.status).toBe('CHANGES_REQUESTED')

    const review = await prisma.review.findFirst({ where: { versionId, reviewerId } })
    expect(review?.comment).toBe('Please fix the typo on page 2')
    expect(review?.status).toBe('CHANGES_REQUESTED')
  })

  it('allows a second request-changes once the version is already CHANGES_REQUESTED', async () => {
    const document = await createSubmittedDocument('Needs changes twice')
    const versionId = document.currentVersion.id

    await request(app)
      .post(`/versions/${versionId}/request-changes`)
      .set('Cookie', `auth_token=${reviewerToken}`)
      .send({ comment: 'First round of feedback' })

    const second = await request(app)
      .post(`/versions/${versionId}/request-changes`)
      .set('Cookie', `auth_token=${reviewerToken}`)
      .send({ comment: 'Second round of feedback' })

    expect(second.status).toBe(204)

    const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: versionId } })
    expect(version.status).toBe('CHANGES_REQUESTED')

    const reviews = await prisma.review.findMany({ where: { versionId }, orderBy: { createdAt: 'asc' } })
    expect(reviews.map((r) => r.comment)).toEqual(['First round of feedback', 'Second round of feedback'])
  })

  it('locks an approved version — a new revision attempt returns 409', async () => {
    const document = await createSubmittedDocument('Locked after approval')
    const versionId = document.currentVersion.id

    await request(app)
      .post(`/versions/${versionId}/approve`)
      .set('Cookie', `auth_token=${reviewerToken}`)

    const res = await request(app)
      .post(`/documents/${document.id}/versions`)
      .set('Cookie', `auth_token=${authorToken}`)
      .attach('file', Buffer.from('v2 content'), 'v2.txt')

    expect(res.status).toBe(409)
  })

  it('downloads a version with its approval record, and refuses a non-member', async () => {
    const document = await createSubmittedDocument('Downloadable')
    const versionId = document.currentVersion.id

    await request(app)
      .post(`/versions/${versionId}/approve`)
      .set('Cookie', `auth_token=${reviewerToken}`)

    const res = await request(app)
      .get(`/versions/${versionId}/download`)
      .set('Cookie', `auth_token=${authorToken}`)

    expect(res.status).toBe(200)
    expect(res.text).toBe('v1 content')
    const approvalRecord = JSON.parse(res.headers['x-approval-record']!)
    expect(approvalRecord.approverId).toBe(reviewerId)

    const refused = await request(app)
      .get(`/versions/${versionId}/download`)
      .set('Cookie', `auth_token=${otherReviewerToken}`)
    expect(refused.status).toBe(404)
  })
})
