import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import { createFixtures, type TestActor } from './support/fixtures.js'
import {
  approveVersion,
  createSubmittedDocument,
  requestChanges,
  uploadDocument,
  uploadRevision,
} from './support/http.js'

describe('review, approval, locking', () => {
  const fixtures = createFixtures('Reviews')
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

  async function submitted(title: string) {
    const doc = await createSubmittedDocument(author.token, { title, categoryId, content: 'v1 content' })
    documentIds.push(doc.id)
    return doc
  }

  it('shows only current, submitted versions in the reviewer queue', async () => {
    const submittedDoc = await submitted('Queue candidate')

    const draft = await uploadDocument(author.token, { title: 'Still drafting', categoryId, content: 'draft' })
    documentIds.push(draft.body.id)

    const res = await request(app).get('/reviews/queue').set('Cookie', `auth_token=${reviewer.token}`)

    expect(res.status).toBe(200)
    const ids = res.body.items.map((v: { id: string }) => v.id)
    expect(ids).toContain(submittedDoc.currentVersion.id)
    expect(ids).not.toContain(draft.body.currentVersion.id)

    const otherCategoryRes = await request(app)
      .get('/reviews/queue')
      .set('Cookie', `auth_token=${otherReviewer.token}`)
    expect(otherCategoryRes.body.items.map((v: { id: string }) => v.id)).not.toContain(
      submittedDoc.currentVersion.id,
    )
  })

  it('approves the current submitted version, writing one approval and one audit row', async () => {
    const document = await submitted('Approve me')
    const versionId = document.currentVersion.id

    const res = await approveVersion(reviewer.token, versionId)
    expect(res.status).toBe(204)

    const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: versionId } })
    expect(version.status).toBe('APPROVED')

    const approval = await prisma.approval.findUnique({ where: { versionId } })
    expect(approval).not.toBeNull()
    expect(approval!.approverId).toBe(reviewer.id)

    const auditActions = (
      await prisma.auditEvent.findMany({ where: { versionId }, orderBy: { timestamp: 'asc' } })
    ).map((e) => e.action)
    expect(auditActions).toContain('APPROVED')
  })

  it('rejects approving a superseded version, naming the actual current version, and creates nothing', async () => {
    const document = await submitted('Stale approval')
    const staleVersionId = document.currentVersion.id

    await uploadRevision(author.token, document.id)

    const res = await approveVersion(reviewer.token, staleVersionId)

    expect(res.status).toBe(409)
    expect(res.body.error).toContain('v2')

    const approval = await prisma.approval.findUnique({ where: { versionId: staleVersionId } })
    expect(approval).toBeNull()
  })

  it('rejects request-changes without a comment', async () => {
    const document = await submitted('No comment')

    const res = await requestChanges(reviewer.token, document.currentVersion.id)

    expect(res.status).toBe(400)
  })

  it('requests changes with a comment, moving the version to CHANGES_REQUESTED', async () => {
    const document = await submitted('Needs changes')
    const versionId = document.currentVersion.id

    const res = await requestChanges(reviewer.token, versionId, 'Please fix the typo on page 2')

    expect(res.status).toBe(204)

    const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: versionId } })
    expect(version.status).toBe('CHANGES_REQUESTED')

    const review = await prisma.review.findFirst({ where: { versionId, reviewerId: reviewer.id } })
    expect(review?.comment).toBe('Please fix the typo on page 2')
    expect(review?.status).toBe('CHANGES_REQUESTED')
  })

  it('allows a second request-changes once the version is already CHANGES_REQUESTED', async () => {
    const document = await submitted('Needs changes twice')
    const versionId = document.currentVersion.id

    await requestChanges(reviewer.token, versionId, 'First round of feedback')
    const second = await requestChanges(reviewer.token, versionId, 'Second round of feedback')

    expect(second.status).toBe(204)

    const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: versionId } })
    expect(version.status).toBe('CHANGES_REQUESTED')

    const reviews = await prisma.review.findMany({ where: { versionId }, orderBy: { createdAt: 'asc' } })
    expect(reviews.map((r) => r.comment)).toEqual(['First round of feedback', 'Second round of feedback'])
  })

  it('locks an approved version — a new revision attempt returns 409', async () => {
    const document = await submitted('Locked after approval')
    const versionId = document.currentVersion.id

    await approveVersion(reviewer.token, versionId)

    const res = await uploadRevision(author.token, document.id)

    expect(res.status).toBe(409)
  })

  it('downloads a version with its approval record, and refuses a non-member', async () => {
    const document = await submitted('Downloadable')
    const versionId = document.currentVersion.id

    await approveVersion(reviewer.token, versionId)

    const res = await request(app)
      .get(`/versions/${versionId}/download`)
      .set('Cookie', `auth_token=${author.token}`)

    expect(res.status).toBe(200)
    expect(res.text).toBe('v1 content')
    const approvalRecord = JSON.parse(res.headers['x-approval-record']!)
    expect(approvalRecord.approverId).toBe(reviewer.id)

    const refused = await request(app)
      .get(`/versions/${versionId}/download`)
      .set('Cookie', `auth_token=${otherReviewer.token}`)
    expect(refused.status).toBe(404)
  })
})
