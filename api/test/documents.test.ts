import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.ts'
import { createFixtures, type TestActor } from './support/fixtures.ts'
import { submitDocument, uploadDocument } from './support/http.ts'

describe('upload & submit', () => {
  const fixtures = createFixtures('Docs')
  const { documentIds } = fixtures

  let categoryId: string
  let otherCategoryId: string
  let author: TestActor
  let reviewer: TestActor

  beforeAll(async () => {
    categoryId = await fixtures.category('Primary')
    otherCategoryId = await fixtures.category('Other')
    author = await fixtures.actor('AUTHOR', 'author', categoryId)
    reviewer = await fixtures.actor('REVIEWER', 'reviewer', categoryId)
  })

  afterAll(fixtures.cleanup)

  it('rejects an upload with no file', async () => {
    const res = await request(app)
      .post('/documents')
      .set('Cookie', `auth_token=${author.token}`)
      .field('title', 'No file')
      .field('categoryId', categoryId)

    expect(res.status).toBe(400)
  })

  it('rejects an unsupported file type', async () => {
    const res = await uploadDocument(author.token, {
      title: 'Bad type',
      categoryId,
      fileName: 'malware.exe',
      content: Buffer.from('binary'),
    })

    expect(res.status).toBe(400)
  })

  it('rejects a file over the 10MB limit', async () => {
    const res = await uploadDocument(author.token, {
      title: 'Too big',
      categoryId,
      fileName: 'huge.txt',
      content: Buffer.alloc(10 * 1024 * 1024 + 1),
    })

    expect(res.status).toBe(400)
  })

  it('rejects uploading into a category the author does not belong to', async () => {
    const res = await uploadDocument(author.token, {
      title: 'Wrong category',
      categoryId: otherCategoryId,
    })

    expect(res.status).toBe(403)
  })

  it('rejects submitting a document twice', async () => {
    const create = await uploadDocument(author.token, { title: 'Double submit', categoryId })
    documentIds.push(create.body.id)

    const first = await submitDocument(author.token, create.body.id)
    expect(first.status).toBe(204)

    const second = await submitDocument(author.token, create.body.id)
    expect(second.status).toBe(409)
  })

  it('hides a draft from other category members but shows it to the author', async () => {
    const create = await uploadDocument(author.token, { title: 'Still a draft', categoryId })
    documentIds.push(create.body.id)

    const listAsReviewer = await request(app)
      .get('/documents')
      .set('Cookie', `auth_token=${reviewer.token}`)
    expect(listAsReviewer.body.items.map((d: { id: string }) => d.id)).not.toContain(create.body.id)

    const listAsAuthor = await request(app)
      .get('/documents')
      .set('Cookie', `auth_token=${author.token}`)
    expect(listAsAuthor.body.items.map((d: { id: string }) => d.id)).toContain(create.body.id)

    const directAsReviewer = await request(app)
      .get(`/documents/${create.body.id}`)
      .set('Cookie', `auth_token=${reviewer.token}`)
    expect(directAsReviewer.status).toBe(404)
  })

  it('shows a submitted document to reviewers in the category, with its current version', async () => {
    const create = await uploadDocument(author.token, { title: 'Submitted doc', categoryId })
    documentIds.push(create.body.id)
    await submitDocument(author.token, create.body.id)

    const listAsReviewer = await request(app)
      .get('/documents')
      .set('Cookie', `auth_token=${reviewer.token}`)
    expect(listAsReviewer.body.items.map((d: { id: string }) => d.id)).toContain(create.body.id)

    const directAsReviewer = await request(app)
      .get(`/documents/${create.body.id}`)
      .set('Cookie', `auth_token=${reviewer.token}`)
    expect(directAsReviewer.status).toBe(200)
    expect(directAsReviewer.body.currentVersion.status).toBe('SUBMITTED')
  })

  it('hides a submitted document from a different author in the same category', async () => {
    const otherAuthor = await fixtures.actor('AUTHOR', 'other-author', categoryId)

    const create = await uploadDocument(author.token, { title: "Someone else's doc", categoryId })
    documentIds.push(create.body.id)
    await submitDocument(author.token, create.body.id)

    const listAsOtherAuthor = await request(app)
      .get('/documents')
      .set('Cookie', `auth_token=${otherAuthor.token}`)
    expect(listAsOtherAuthor.body.items.map((d: { id: string }) => d.id)).not.toContain(create.body.id)

    const directAsOtherAuthor = await request(app)
      .get(`/documents/${create.body.id}`)
      .set('Cookie', `auth_token=${otherAuthor.token}`)
    expect(directAsOtherAuthor.status).toBe(404)

    const listAsOwnAuthor = await request(app)
      .get('/documents')
      .set('Cookie', `auth_token=${author.token}`)
    expect(listAsOwnAuthor.body.items.map((d: { id: string }) => d.id)).toContain(create.body.id)
  })

  it('sorts by most recently changed, not most recently created', async () => {
    const older = await uploadDocument(author.token, { title: 'Older but just touched', categoryId })
    documentIds.push(older.body.id)

    const newer = await uploadDocument(author.token, { title: 'Newer but untouched', categoryId })
    documentIds.push(newer.body.id)

    // Touch the older document by submitting it — it should now sort ahead of
    // the newer, untouched one.
    await submitDocument(author.token, older.body.id)

    const list = await request(app).get('/documents').set('Cookie', `auth_token=${author.token}`)
    const ids = list.body.items.map((d: { id: string }) => d.id)
    expect(ids.indexOf(older.body.id)).toBeLessThan(ids.indexOf(newer.body.id))
  })

  it('filters the list by status and category', async () => {
    const draft = await uploadDocument(author.token, { title: 'Filter test draft', categoryId })
    documentIds.push(draft.body.id)

    const submitted = await uploadDocument(author.token, { title: 'Filter test submitted', categoryId })
    documentIds.push(submitted.body.id)
    await submitDocument(author.token, submitted.body.id)

    const draftOnly = await request(app)
      .get('/documents?status=DRAFT')
      .set('Cookie', `auth_token=${author.token}`)
    const draftIds = draftOnly.body.items.map((d: { id: string }) => d.id)
    expect(draftIds).toContain(draft.body.id)
    expect(draftIds).not.toContain(submitted.body.id)

    const submittedOnly = await request(app)
      .get('/documents?status=SUBMITTED')
      .set('Cookie', `auth_token=${author.token}`)
    const submittedIds = submittedOnly.body.items.map((d: { id: string }) => d.id)
    expect(submittedIds).toContain(submitted.body.id)
    expect(submittedIds).not.toContain(draft.body.id)

    const outsideCategory = await request(app)
      .get(`/documents?categoryId=${otherCategoryId}`)
      .set('Cookie', `auth_token=${author.token}`)
    expect(outsideCategory.body.items).toHaveLength(0)

    const withinCategory = await request(app)
      .get(`/documents?categoryId=${categoryId}`)
      .set('Cookie', `auth_token=${author.token}`)
    const withinIds = withinCategory.body.items.map((d: { id: string }) => d.id)
    expect(withinIds).toContain(draft.body.id)
    expect(withinIds).toContain(submitted.body.id)
  })
})
