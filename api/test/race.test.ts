import { randomUUID } from 'node:crypto'
import bcrypt from 'bcrypt'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import { signAuthToken } from '../src/lib/jwt.js'

// The single most-checked suite in the spec — see versioning-invariants and
// concurrency-testing skills. Real Postgres, looped, never mocked.
const ITERATIONS = 50

describe('concurrency races', () => {
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

    const category = await prisma.category.create({ data: { name: `Race ${suffix}` } })
    const otherCategory = await prisma.category.create({ data: { name: `Race Other ${suffix}` } })
    categoryId = category.id
    otherCategoryId = otherCategory.id

    const author = await prisma.user.create({
      data: { email: `race-author-${suffix}@example.com`, passwordHash, role: 'AUTHOR' },
    })
    const reviewer = await prisma.user.create({
      data: { email: `race-reviewer-${suffix}@example.com`, passwordHash, role: 'REVIEWER' },
    })
    const otherReviewer = await prisma.user.create({
      data: { email: `race-other-reviewer-${suffix}@example.com`, passwordHash, role: 'REVIEWER' },
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

  // Fresh document + current SUBMITTED version + a pending review, for every iteration —
  // reusing one document across iterations would mean each loop tests a different scenario.
  async function seedSubmittedVersion() {
    const create = await request(app)
      .post('/documents')
      .set('Authorization', `Bearer ${authorToken}`)
      .field('title', `Race ${randomUUID()}`)
      .field('categoryId', categoryId)
      .attach('file', Buffer.from('v1 content'), 'v1.txt')
    const documentId = create.body.id as string
    const versionId = create.body.currentVersion.id as string
    documentIds.push(documentId)

    await request(app)
      .post(`/documents/${documentId}/submit`)
      .set('Authorization', `Bearer ${authorToken}`)
    await prisma.review.create({ data: { versionId, reviewerId, status: 'PENDING' } })

    return { documentId, versionId }
  }

  function assertNoServerErrors(results: PromiseSettledResult<request.Response>[]) {
    for (const result of results) {
      if (result.status === 'rejected') {
        throw result.reason
      }
      expect(result.value.status).not.toBe(500)
    }
  }

  it('never approves a superseded version when a revision upload races an approval', async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const { documentId, versionId } = await seedSubmittedVersion()

      const [uploadResult, approveResult] = await Promise.allSettled([
        request(app)
          .post(`/documents/${documentId}/versions`)
          .set('Authorization', `Bearer ${authorToken}`)
          .attach('file', Buffer.from('v2 content'), 'v2.txt'),
        request(app)
          .post(`/versions/${versionId}/approve`)
          .set('Authorization', `Bearer ${reviewerToken}`),
      ])
      assertNoServerErrors([uploadResult, approveResult])

      // 1. exactly one current version, always
      const currentCount = await prisma.documentVersion.count({
        where: { documentId, isCurrent: true },
      })
      expect(currentCount).toBe(1)

      // 2. no approval on a non-current version
      const badApprovals = await prisma.approval.findMany({
        where: { version: { documentId, isCurrent: false } },
      })
      expect(badApprovals).toHaveLength(0)

      // 3. exactly one of two known-good shapes, never a third
      const uploadStatus = (uploadResult as PromiseFulfilledResult<request.Response>).value.status
      const approveStatus = (approveResult as PromiseFulfilledResult<request.Response>).value.status
      const uploadWon = uploadStatus === 201 && approveStatus === 409
      const approveWon = approveStatus === 204 && uploadStatus === 409
      expect(uploadWon || approveWon).toBe(true)

      const approvalCount = await prisma.approval.count({ where: { versionId } })
      expect(approvalCount).toBe(approveWon ? 1 : 0)
    }
  })

  it('never creates two approvals when two reviewers approve the same version at once', async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const { documentId, versionId } = await seedSubmittedVersion()

      const [resA, resB] = await Promise.allSettled([
        request(app).post(`/versions/${versionId}/approve`).set('Authorization', `Bearer ${reviewerToken}`),
        request(app).post(`/versions/${versionId}/approve`).set('Authorization', `Bearer ${reviewerToken}`),
      ])
      assertNoServerErrors([resA, resB])

      const statuses = [resA, resB]
        .map((r) => (r as PromiseFulfilledResult<request.Response>).value.status)
        .sort()
      expect(statuses).toEqual([204, 409])

      const approvalCount = await prisma.approval.count({ where: { versionId } })
      expect(approvalCount).toBe(1)

      const currentCount = await prisma.documentVersion.count({
        where: { documentId, isCurrent: true },
      })
      expect(currentCount).toBe(1)
    }
  })

  it('never leaves a pending review dangling on a superseded version when upload races request-changes', async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const { documentId, versionId } = await seedSubmittedVersion()

      const [uploadResult, changesResult] = await Promise.allSettled([
        request(app)
          .post(`/documents/${documentId}/versions`)
          .set('Authorization', `Bearer ${authorToken}`)
          .attach('file', Buffer.from('v2 content'), 'v2.txt'),
        request(app)
          .post(`/versions/${versionId}/request-changes`)
          .set('Authorization', `Bearer ${reviewerToken}`)
          .send({ comment: 'race comment' }),
      ])
      assertNoServerErrors([uploadResult, changesResult])

      const currentCount = await prisma.documentVersion.count({
        where: { documentId, isCurrent: true },
      })
      expect(currentCount).toBe(1)

      const danglingPendingReviews = await prisma.review.findMany({
        where: { versionId, status: 'PENDING' },
      })
      expect(danglingPendingReviews).toHaveLength(0)

      const uploadStatus = (uploadResult as PromiseFulfilledResult<request.Response>).value.status
      const changesStatus = (changesResult as PromiseFulfilledResult<request.Response>).value.status
      // Request-changes doesn't freeze the document, so both may legitimately succeed
      // (reviewer sends it back, author revises) — only a stale request-changes is 409.
      expect([201]).toContain(uploadStatus)
      expect([204, 409]).toContain(changesStatus)
    }
  })

  it('rejects approving an already-approved version and creates no second approval', async () => {
    const { versionId } = await seedSubmittedVersion()

    const first = await request(app)
      .post(`/versions/${versionId}/approve`)
      .set('Authorization', `Bearer ${reviewerToken}`)
    expect(first.status).toBe(204)

    const second = await request(app)
      .post(`/versions/${versionId}/approve`)
      .set('Authorization', `Bearer ${reviewerToken}`)
    expect(second.status).toBe(409)

    const approvalCount = await prisma.approval.count({ where: { versionId } })
    expect(approvalCount).toBe(1)
  })

  it('refuses a reviewer outside the category from approving — 404, not 409', async () => {
    const { versionId } = await seedSubmittedVersion()

    const res = await request(app)
      .post(`/versions/${versionId}/approve`)
      .set('Authorization', `Bearer ${otherReviewerToken}`)
    expect(res.status).toBe(404)

    const approvalCount = await prisma.approval.count({ where: { versionId } })
    expect(approvalCount).toBe(0)
  })
})
