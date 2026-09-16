import { randomUUID } from 'node:crypto'
import bcrypt from 'bcrypt'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'

// One test walking the whole flow end to end, exactly as a real session would
// see it: login, upload, submit, comment, approve, download. Every other test
// file exercises a slice of this in isolation — this one proves the slices
// still fit together when driven in order through the actual HTTP surface,
// with cookies carried request to request like a browser would.
describe('E2E happy path: login -> upload -> submit -> comment -> approve -> download', () => {
  const suffix = randomUUID().slice(0, 8)
  const password = 'password123'

  let categoryId: string
  let authorId: string
  let reviewerId: string
  const documentIds: string[] = []

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 10)

    const category = await prisma.category.create({ data: { name: `E2E ${suffix}` } })
    categoryId = category.id

    const author = await prisma.user.create({
      data: { email: `e2e-author-${suffix}@example.com`, passwordHash, role: 'AUTHOR' },
    })
    const reviewer = await prisma.user.create({
      data: { email: `e2e-reviewer-${suffix}@example.com`, passwordHash, role: 'REVIEWER' },
    })
    authorId = author.id
    reviewerId = reviewer.id

    await prisma.categoryMembership.createMany({
      data: [
        { userId: authorId, categoryId },
        { userId: reviewerId, categoryId },
      ],
    })
  })

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { documentId: { in: documentIds } } })
    await prisma.comment.deleteMany({ where: { version: { documentId: { in: documentIds } } } })
    await prisma.approval.deleteMany({ where: { version: { documentId: { in: documentIds } } } })
    await prisma.review.deleteMany({ where: { version: { documentId: { in: documentIds } } } })
    await prisma.documentVersion.deleteMany({ where: { documentId: { in: documentIds } } })
    await prisma.document.deleteMany({ where: { id: { in: documentIds } } })
    await prisma.categoryMembership.deleteMany({ where: { categoryId } })
    await prisma.user.deleteMany({ where: { id: { in: [authorId, reviewerId] } } })
    await prisma.category.deleteMany({ where: { id: categoryId } })
  })

  it('walks the full flow as two real sessions, cookies and all', async () => {
    // 1. Author logs in — the login endpoint sets an httpOnly cookie, not a token in the body.
    const authorLogin = await request(app)
      .post('/auth/login')
      .send({ email: `e2e-author-${suffix}@example.com`, password })
    expect(authorLogin.status).toBe(200)
    const authorCookie = getAuthCookie(authorLogin)

    // 2. Author uploads a document.
    const upload = await request(app)
      .post('/documents')
      .set('Cookie', authorCookie)
      .field('title', 'E2E walkthrough doc')
      .field('categoryId', categoryId)
      .attach('file', Buffer.from('The quick brown fox jumps over the lazy dog.'), 'v1.txt')
    expect(upload.status).toBe(201)
    documentIds.push(upload.body.id)
    const documentId: string = upload.body.id
    const versionId: string = upload.body.currentVersion.id

    // 3. Author submits it for review.
    const submit = await request(app).post(`/documents/${documentId}/submit`).set('Cookie', authorCookie)
    expect(submit.status).toBe(204)

    // 4. Reviewer logs in separately and sees it in the queue.
    const reviewerLogin = await request(app)
      .post('/auth/login')
      .send({ email: `e2e-reviewer-${suffix}@example.com`, password })
    expect(reviewerLogin.status).toBe(200)
    const reviewerCookie = getAuthCookie(reviewerLogin)

    const queue = await request(app).get('/reviews/queue').set('Cookie', reviewerCookie)
    expect(queue.status).toBe(200)
    expect(queue.body.items.map((v: { id: string }) => v.id)).toContain(versionId)

    // 5. Reviewer highlights a passage and leaves an inline comment on it.
    const comment = await request(app)
      .post(`/versions/${versionId}/comments`)
      .set('Cookie', reviewerCookie)
      .send({
        body: 'Why a fox specifically?',
        anchorQuote: 'quick brown fox',
        anchorStart: 4,
        anchorEnd: 19,
      })
    expect(comment.status).toBe(201)

    const comments = await request(app).get(`/versions/${versionId}/comments`).set('Cookie', authorCookie)
    expect(comments.status).toBe(200)
    expect(comments.body.items).toHaveLength(1)
    expect(comments.body.items[0].body).toBe('Why a fox specifically?')

    // 6. Reviewer approves — a single conditional write against the current version.
    const approve = await request(app).post(`/versions/${versionId}/approve`).set('Cookie', reviewerCookie)
    expect(approve.status).toBe(204)

    // 7. Author downloads the approved version and its approval record comes back with it.
    const download = await request(app).get(`/versions/${versionId}/download`).set('Cookie', authorCookie)
    expect(download.status).toBe(200)
    expect(download.text).toBe('The quick brown fox jumps over the lazy dog.')
    const approvalRecord = JSON.parse(download.headers['x-approval-record']!)
    expect(approvalRecord.approverId).toBe(reviewerId)

    // 8. The approved version is locked — a new revision attempt is refused, not silently accepted.
    const lockedRevision = await request(app)
      .post(`/documents/${documentId}/versions`)
      .set('Cookie', authorCookie)
      .attach('file', Buffer.from('v2 content'), 'v2.txt')
    expect(lockedRevision.status).toBe(409)

    // 9. The audit trail records the whole story in order, actor by actor.
    // Comments aren't an audited action — the audit table tracks state
    // transitions (upload, submit, approve, ...), not every read/annotate.
    const audit = await request(app).get(`/documents/${documentId}/audit`).set('Cookie', authorCookie)
    expect(audit.status).toBe(200)
    const actions = audit.body.items.map((e: { action: string }) => e.action).reverse()
    expect(actions).toEqual(['DOCUMENT_UPLOADED', 'SUBMITTED', 'APPROVED'])
  })
})

function getAuthCookie(res: request.Response): string {
  const cookies = res.headers['set-cookie'] as unknown as string[]
  const authCookie = cookies?.find((c) => c.startsWith('auth_token='))
  if (!authCookie) throw new Error('no auth_token cookie in response')
  return authCookie.split(';')[0]!
}
