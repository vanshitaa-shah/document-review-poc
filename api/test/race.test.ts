import { randomUUID } from 'node:crypto'
import type request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../src/lib/prisma.js'
import { createFixtures, type TestActor } from './support/fixtures.js'
import { approveVersion, createSubmittedDocument, requestChanges, uploadRevision } from './support/http.js'

// The single most-checked suite in the spec — see versioning-invariants and
// concurrency-testing skills. Real Postgres, looped, never mocked.
const ITERATIONS = 50

describe('concurrency races', () => {
  const fixtures = createFixtures('Race')
  const { documentIds } = fixtures

  let categoryId: string
  let otherCategoryId: string
  let author: TestActor
  let reviewer: TestActor
  let otherReviewer: TestActor

  beforeAll(async () => {
    categoryId = await fixtures.category('Primary')
    otherCategoryId = await fixtures.category('Other')
    author = await fixtures.actor('AUTHOR', 'author', categoryId)
    reviewer = await fixtures.actor('REVIEWER', 'reviewer', categoryId)
    otherReviewer = await fixtures.actor('REVIEWER', 'other-reviewer', otherCategoryId)
  })

  afterAll(fixtures.cleanup)

  // Fresh document + current SUBMITTED version + a pending review, for every iteration —
  // reusing one document across iterations would mean each loop tests a different scenario.
  async function seedSubmittedVersion() {
    const doc = await createSubmittedDocument(author.token, {
      title: `Race ${randomUUID()}`,
      categoryId,
      content: 'v1 content',
    })
    documentIds.push(doc.id)
    await prisma.review.create({ data: { versionId: doc.currentVersion.id, reviewerId: reviewer.id, status: 'PENDING' } })

    return { documentId: doc.id, versionId: doc.currentVersion.id }
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
        uploadRevision(author.token, documentId),
        approveVersion(reviewer.token, versionId),
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
  }, 900000) // 50 iterations against Neon — observed real round-trips here run well past the
  // ~300ms this budget originally assumed, so this needs more headroom, not fewer iterations

  it('never creates two approvals when two reviewers approve the same version at once', async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const { documentId, versionId } = await seedSubmittedVersion()

      const [resA, resB] = await Promise.allSettled([
        approveVersion(reviewer.token, versionId),
        approveVersion(reviewer.token, versionId),
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
  }, 900000) // 50 iterations against Neon — see timeout note on the first race test above

  it('never leaves a pending review dangling on a superseded version when upload races request-changes', async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const { documentId, versionId } = await seedSubmittedVersion()

      const [uploadResult, changesResult] = await Promise.allSettled([
        uploadRevision(author.token, documentId),
        requestChanges(reviewer.token, versionId, 'race comment'),
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
  }, 900000) // 50 iterations against Neon — see timeout note on the first race test above

  it('rejects approving an already-approved version and creates no second approval', async () => {
    const { versionId } = await seedSubmittedVersion()

    const first = await approveVersion(reviewer.token, versionId)
    expect(first.status).toBe(204)

    const second = await approveVersion(reviewer.token, versionId)
    expect(second.status).toBe(409)

    const approvalCount = await prisma.approval.count({ where: { versionId } })
    expect(approvalCount).toBe(1)
  })

  it('refuses a reviewer outside the category from approving — 404, not 409', async () => {
    const { versionId } = await seedSubmittedVersion()

    const res = await approveVersion(otherReviewer.token, versionId)
    expect(res.status).toBe(404)

    const approvalCount = await prisma.approval.count({ where: { versionId } })
    expect(approvalCount).toBe(0)
  })
})
