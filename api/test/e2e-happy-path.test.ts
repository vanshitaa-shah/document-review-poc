import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.ts'
import { createFixtures, TEST_PASSWORD, type TestActor } from './support/fixtures.ts'
import { extractAuthCookie } from './support/http.ts'

// One test walking the whole flow end to end, exactly as a real session would
// see it: login, upload, submit, comment, approve, download. Every other test
// file exercises a slice of this in isolation — this one proves the slices
// still fit together when driven in order through the actual HTTP surface,
// with cookies carried request to request like a browser would.
describe('E2E happy path: login -> upload -> submit -> comment -> approve -> download', () => {
  const fixtures = createFixtures('E2E')
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

  it('walks the full flow as two real sessions, cookies and all', async () => {
    // 1. Author logs in — the login endpoint sets an httpOnly cookie, not a token in the body.
    const authorLogin = await request(app).post('/auth/login').send({ email: author.email, password: TEST_PASSWORD })
    expect(authorLogin.status).toBe(200)
    const authorCookie = extractAuthCookie(authorLogin)

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
      .send({ email: reviewer.email, password: TEST_PASSWORD })
    expect(reviewerLogin.status).toBe(200)
    const reviewerCookie = extractAuthCookie(reviewerLogin)

    const queue = await request(app).get('/reviews/queue').set('Cookie', reviewerCookie)
    expect(queue.status).toBe(200)
    expect(queue.body.items.map((v: { id: string }) => v.id)).toContain(versionId)

    // 5. Reviewer highlights a passage and leaves an inline comment on it —
    // this is itself a request for changes, so it moves v1 to
    // CHANGES_REQUESTED the same way the explicit request-changes endpoint
    // would (see create-comment.ts). It can no longer be approved directly
    // from here; the author has to revise first.
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

    const staleApprove = await request(app).post(`/versions/${versionId}/approve`).set('Cookie', reviewerCookie)
    expect(staleApprove.status).toBe(409)

    // 6. Author revises to address the feedback — v2 is a pending draft (v1
    // stays current for the reviewer); submitting it supersedes v1 and starts v2 clean.
    const revise = await request(app)
      .post(`/documents/${documentId}/versions`)
      .set('Cookie', authorCookie)
      .attach('file', Buffer.from('The quick red fox jumps over the lazy dog.'), 'v2.txt')
    expect(revise.status).toBe(201)
    const v2Id: string = revise.body.id

    const resubmit = await request(app).post(`/documents/${documentId}/submit`).set('Cookie', authorCookie)
    expect(resubmit.status).toBe(204)

    // 7. Reviewer approves v2 — a single conditional write against the current version.
    const approve = await request(app).post(`/versions/${v2Id}/approve`).set('Cookie', reviewerCookie)
    expect(approve.status).toBe(204)

    // 8. Author downloads the approved version and its approval record comes back with it.
    const download = await request(app).get(`/versions/${v2Id}/download`).set('Cookie', authorCookie)
    expect(download.status).toBe(200)
    expect(download.text).toBe('The quick red fox jumps over the lazy dog.')
    const approvalRecord = JSON.parse(download.headers['x-approval-record']!)
    expect(approvalRecord.approverId).toBe(reviewer.id)

    // 9. The approved version is locked — a new revision attempt is refused, not silently accepted.
    const lockedRevision = await request(app)
      .post(`/documents/${documentId}/versions`)
      .set('Cookie', authorCookie)
      .attach('file', Buffer.from('v3 content'), 'v3.txt')
    expect(lockedRevision.status).toBe(409)

    // 10. The audit trail records the whole story in order, actor by actor —
    // including the inline comment, which is itself a CHANGES_REQUESTED event.
    const audit = await request(app).get(`/documents/${documentId}/audit`).set('Cookie', authorCookie)
    expect(audit.status).toBe(200)
    const actions = audit.body.items.map((e: { action: string }) => e.action).reverse()
    expect(actions).toEqual([
      'DOCUMENT_UPLOADED',
      'SUBMITTED',
      'CHANGES_REQUESTED',
      'VERSION_UPLOADED',
      'VERSION_SUPERSEDED',
      'SUBMITTED',
      'APPROVED',
    ])
  }, 120000) // 13 sequential requests against Neon — default 30s assumes ~300ms/round-trip, too tight here
})
