import { randomUUID } from 'node:crypto'
import bcrypt from 'bcrypt'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import { signAuthToken } from '../src/lib/jwt.js'

describe('upload & submit', () => {
  const suffix = randomUUID().slice(0, 8)

  let categoryId: string
  let otherCategoryId: string
  let authorId: string
  let reviewerId: string
  let authorToken: string
  let reviewerToken: string
  const documentIds: string[] = []

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('password123', 10)

    const category = await prisma.category.create({ data: { name: `Docs ${suffix}` } })
    const otherCategory = await prisma.category.create({ data: { name: `Docs Other ${suffix}` } })
    categoryId = category.id
    otherCategoryId = otherCategory.id

    const author = await prisma.user.create({
      data: { email: `docs-author-${suffix}@example.com`, passwordHash, role: 'AUTHOR' },
    })
    const reviewer = await prisma.user.create({
      data: { email: `docs-reviewer-${suffix}@example.com`, passwordHash, role: 'REVIEWER' },
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
    reviewerToken = signAuthToken({ sub: reviewerId, role: 'REVIEWER' })
  })

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { documentId: { in: documentIds } } })
    await prisma.documentVersion.deleteMany({ where: { documentId: { in: documentIds } } })
    await prisma.document.deleteMany({ where: { id: { in: documentIds } } })
    await prisma.categoryMembership.deleteMany({ where: { categoryId: { in: [categoryId, otherCategoryId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [authorId, reviewerId] } } })
    await prisma.category.deleteMany({ where: { id: { in: [categoryId, otherCategoryId] } } })
  })

  it('rejects an upload with no file', async () => {
    const res = await request(app)
      .post('/documents')
      .set('Authorization', `Bearer ${authorToken}`)
      .field('title', 'No file')
      .field('categoryId', categoryId)

    expect(res.status).toBe(400)
  })

  it('rejects an unsupported file type', async () => {
    const res = await request(app)
      .post('/documents')
      .set('Authorization', `Bearer ${authorToken}`)
      .field('title', 'Bad type')
      .field('categoryId', categoryId)
      .attach('file', Buffer.from('binary'), 'malware.exe')

    expect(res.status).toBe(400)
  })

  it('rejects a file over the 10MB limit', async () => {
    const res = await request(app)
      .post('/documents')
      .set('Authorization', `Bearer ${authorToken}`)
      .field('title', 'Too big')
      .field('categoryId', categoryId)
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), 'huge.txt')

    expect(res.status).toBe(400)
  })

  it('rejects uploading into a category the author does not belong to', async () => {
    const res = await request(app)
      .post('/documents')
      .set('Authorization', `Bearer ${authorToken}`)
      .field('title', 'Wrong category')
      .field('categoryId', otherCategoryId)
      .attach('file', Buffer.from('content'), 'v1.txt')

    expect(res.status).toBe(403)
  })

  it('rejects submitting a document twice', async () => {
    const create = await request(app)
      .post('/documents')
      .set('Authorization', `Bearer ${authorToken}`)
      .field('title', 'Double submit')
      .field('categoryId', categoryId)
      .attach('file', Buffer.from('content'), 'v1.txt')
    documentIds.push(create.body.id)

    const first = await request(app)
      .post(`/documents/${create.body.id}/submit`)
      .set('Authorization', `Bearer ${authorToken}`)
    expect(first.status).toBe(204)

    const second = await request(app)
      .post(`/documents/${create.body.id}/submit`)
      .set('Authorization', `Bearer ${authorToken}`)
    expect(second.status).toBe(409)
  })

  it('hides a draft from other category members but shows it to the author', async () => {
    const create = await request(app)
      .post('/documents')
      .set('Authorization', `Bearer ${authorToken}`)
      .field('title', 'Still a draft')
      .field('categoryId', categoryId)
      .attach('file', Buffer.from('content'), 'v1.txt')
    documentIds.push(create.body.id)

    const listAsReviewer = await request(app)
      .get('/documents')
      .set('Authorization', `Bearer ${reviewerToken}`)
    expect(listAsReviewer.body.items.map((d: { id: string }) => d.id)).not.toContain(create.body.id)

    const listAsAuthor = await request(app)
      .get('/documents')
      .set('Authorization', `Bearer ${authorToken}`)
    expect(listAsAuthor.body.items.map((d: { id: string }) => d.id)).toContain(create.body.id)

    const directAsReviewer = await request(app)
      .get(`/documents/${create.body.id}`)
      .set('Authorization', `Bearer ${reviewerToken}`)
    expect(directAsReviewer.status).toBe(404)
  })

  it('shows a submitted document to reviewers in the category, with its current version', async () => {
    const create = await request(app)
      .post('/documents')
      .set('Authorization', `Bearer ${authorToken}`)
      .field('title', 'Submitted doc')
      .field('categoryId', categoryId)
      .attach('file', Buffer.from('content'), 'v1.txt')
    documentIds.push(create.body.id)

    await request(app)
      .post(`/documents/${create.body.id}/submit`)
      .set('Authorization', `Bearer ${authorToken}`)

    const listAsReviewer = await request(app)
      .get('/documents')
      .set('Authorization', `Bearer ${reviewerToken}`)
    expect(listAsReviewer.body.items.map((d: { id: string }) => d.id)).toContain(create.body.id)

    const directAsReviewer = await request(app)
      .get(`/documents/${create.body.id}`)
      .set('Authorization', `Bearer ${reviewerToken}`)
    expect(directAsReviewer.status).toBe(200)
    expect(directAsReviewer.body.currentVersion.status).toBe('SUBMITTED')
  })

  it('hides a submitted document from a different author in the same category', async () => {
    const passwordHash = await bcrypt.hash('password123', 10)
    const otherAuthor = await prisma.user.create({
      data: { email: `docs-other-author-${suffix}@example.com`, passwordHash, role: 'AUTHOR' },
    })
    await prisma.categoryMembership.create({ data: { userId: otherAuthor.id, categoryId } })
    const otherAuthorToken = signAuthToken({ sub: otherAuthor.id, role: 'AUTHOR' })

    const create = await request(app)
      .post('/documents')
      .set('Authorization', `Bearer ${authorToken}`)
      .field('title', "Someone else's doc")
      .field('categoryId', categoryId)
      .attach('file', Buffer.from('content'), 'v1.txt')
    documentIds.push(create.body.id)

    await request(app)
      .post(`/documents/${create.body.id}/submit`)
      .set('Authorization', `Bearer ${authorToken}`)

    const listAsOtherAuthor = await request(app)
      .get('/documents')
      .set('Authorization', `Bearer ${otherAuthorToken}`)
    expect(listAsOtherAuthor.body.items.map((d: { id: string }) => d.id)).not.toContain(create.body.id)

    const directAsOtherAuthor = await request(app)
      .get(`/documents/${create.body.id}`)
      .set('Authorization', `Bearer ${otherAuthorToken}`)
    expect(directAsOtherAuthor.status).toBe(404)

    const listAsOwnAuthor = await request(app)
      .get('/documents')
      .set('Authorization', `Bearer ${authorToken}`)
    expect(listAsOwnAuthor.body.items.map((d: { id: string }) => d.id)).toContain(create.body.id)

    await prisma.categoryMembership.deleteMany({ where: { userId: otherAuthor.id } })
    await prisma.user.delete({ where: { id: otherAuthor.id } })
  })
})
