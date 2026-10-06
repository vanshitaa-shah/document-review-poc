import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.ts'
import { prisma } from '../src/lib/prisma.ts'
import { createFixtures, type TestActor } from './support/fixtures.ts'
import { approveVersion, createDocument, submitDocument, uploadRevision } from './support/http.ts'

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

  it('keeps the reviewed version current when a revision is uploaded, and supersedes only on submit', async () => {
    const doc = await document('Supersession chain')
    const v1 = doc.currentVersion
    await submitDocument(author.token, doc.id)

    const upload = await uploadRevision(author.token, doc.id)
    expect(upload.status).toBe(201)
    expect(upload.body.versionNumber).toBe(2)
    expect(upload.body.isCurrent).toBe(false)
    expect(upload.body.status).toBe('DRAFT')

    // Reviewer's version is untouched by an unsubmitted draft.
    const stillCurrent = await prisma.documentVersion.findUniqueOrThrow({ where: { id: v1.id } })
    expect(stillCurrent.isCurrent).toBe(true)
    expect(stillCurrent.status).toBe('SUBMITTED')

    const submit = await submitDocument(author.token, doc.id)
    expect(submit.status).toBe(204)

    const oldVersion = await prisma.documentVersion.findUniqueOrThrow({ where: { id: v1.id } })
    expect(oldVersion.isCurrent).toBe(false)
    expect(oldVersion.status).toBe('SUPERSEDED')

    const promoted = await prisma.documentVersion.findUniqueOrThrow({ where: { id: upload.body.id } })
    expect(promoted.isCurrent).toBe(true)
    expect(promoted.status).toBe('SUBMITTED')

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
      'SUBMITTED',
      'VERSION_UPLOADED',
      'VERSION_SUPERSEDED',
      'SUBMITTED',
    ])
  })

  it('hides a pending draft from reviewers but shows it to the author', async () => {
    const doc = await document('Draft visibility')
    await submitDocument(author.token, doc.id)
    const upload = await uploadRevision(author.token, doc.id)

    const asAuthor = await request(app).get(`/documents/${doc.id}`).set('Cookie', `auth_token=${author.token}`)
    expect(asAuthor.body.currentVersion.id).toBe(doc.currentVersion.id)
    expect(asAuthor.body.pendingDraft.id).toBe(upload.body.id)

    const asReviewer = await request(app).get(`/documents/${doc.id}`).set('Cookie', `auth_token=${reviewer.token}`)
    expect(asReviewer.status).toBe(200)
    expect(asReviewer.body.currentVersion.id).toBe(doc.currentVersion.id)
    expect(asReviewer.body.pendingDraft).toBeNull()

    const history = await request(app)
      .get(`/documents/${doc.id}/versions`)
      .set('Cookie', `auth_token=${reviewer.token}`)
    expect(history.body.items.map((v: { versionNumber: number }) => v.versionNumber)).toEqual([1])

    const content = await request(app)
      .get(`/versions/${upload.body.id}/content`)
      .set('Cookie', `auth_token=${reviewer.token}`)
    expect(content.status).toBe(404)
  })

  it('keeps drafts and discarded drafts out of the reviewer history and audit trail, but not the author\'s', async () => {
    const doc = await document('Draft privacy')
    await submitDocument(author.token, doc.id)
    const discarded = await uploadRevision(author.token, doc.id, { content: 'first attempt' })
    const draft = await uploadRevision(author.token, doc.id, { content: 'second attempt' })

    const stored = await prisma.documentVersion.findUniqueOrThrow({ where: { id: discarded.body.id } })
    expect(stored.status).toBe('DISCARDED')

    const get = (path: string, who: TestActor) =>
      request(app).get(path).set('Cookie', `auth_token=${who.token}`)

    const reviewerAudit = await get(`/documents/${doc.id}/audit`, reviewer)
    expect(reviewerAudit.body.items.map((e: { action: string }) => e.action)).toEqual(['SUBMITTED', 'DOCUMENT_UPLOADED'])
    const authorAudit = await get(`/documents/${doc.id}/audit`, author)
    expect(authorAudit.body.items.length).toBeGreaterThan(reviewerAudit.body.items.length)

    const reviewerHistory = await get(`/documents/${doc.id}/versions`, reviewer)
    expect(reviewerHistory.body.items.map((v: { versionNumber: number }) => v.versionNumber)).toEqual([1])
    const authorHistory = await get(`/documents/${doc.id}/versions`, author)
    expect(authorHistory.body.items.map((v: { versionNumber: number }) => v.versionNumber)).toEqual([3, 2, 1])

    expect((await get(`/versions/${discarded.body.id}/content`, reviewer)).status).toBe(404)

    // Once submitted, the draft becomes visible; the discarded attempt stays hidden.
    await submitDocument(author.token, doc.id)
    const afterHistory = await get(`/documents/${doc.id}/versions`, reviewer)
    expect(afterHistory.body.items.map((v: { id: string }) => v.id)).toEqual([draft.body.id, doc.currentVersion.id])
    const afterAudit = await get(`/documents/${doc.id}/audit`, reviewer)
    expect(afterAudit.body.items.map((e: { action: string }) => e.action)).toEqual([
      'SUBMITTED',
      'VERSION_SUPERSEDED',
      'VERSION_UPLOADED',
      'SUBMITTED',
      'DOCUMENT_UPLOADED',
    ])
  })

  it('replaces an earlier pending draft when the author uploads again, and refuses submit with no draft', async () => {
    const doc = await document('Draft replacement')
    await submitDocument(author.token, doc.id)

    const noDraft = await submitDocument(author.token, doc.id)
    expect(noDraft.status).toBe(409)

    const first = await uploadRevision(author.token, doc.id)
    const second = await uploadRevision(author.token, doc.id)
    expect(second.body.versionNumber).toBe(first.body.versionNumber + 1)

    const drafts = await prisma.documentVersion.findMany({ where: { documentId: doc.id, status: 'DRAFT' } })
    expect(drafts.map((d) => d.id)).toEqual([second.body.id])
  })

  it('does not let a revision be uploaded or submitted over an approved version', async () => {
    const doc = await document('Approved lock')
    await submitDocument(author.token, doc.id)
    await approveVersion(reviewer.token, doc.currentVersion.id)

    const res = await uploadRevision(author.token, doc.id)
    expect(res.status).toBe(409)
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
    expect(res.body.items[1].status).toBe('DISCARDED') // v1 was never submitted
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

  it('leaves exactly one pending draft when revision uploads race on a submitted document', async () => {
    const doc = await document('Concurrent drafts')
    await submitDocument(author.token, doc.id)

    const [resA, resB] = await Promise.all([
      uploadRevision(author.token, doc.id, { fileName: 'a.txt', content: 'a' }),
      uploadRevision(author.token, doc.id, { fileName: 'b.txt', content: 'b' }),
    ])
    expect(resA.status).toBe(201)
    expect(resB.status).toBe(201)

    const drafts = await prisma.documentVersion.findMany({ where: { documentId: doc.id, status: 'DRAFT' } })
    expect(drafts).toHaveLength(1)
    expect(drafts[0]!.versionNumber).toBe(3)
    expect(await prisma.documentVersion.count({ where: { documentId: doc.id, isCurrent: true } })).toBe(1)
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
