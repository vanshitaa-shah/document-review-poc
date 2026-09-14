import { randomUUID } from 'node:crypto'
import bcrypt from 'bcrypt'
import JSZip from 'jszip'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import { signAuthToken } from '../src/lib/jwt.js'

// A minimal but genuinely valid .docx — just enough OOXML for mammoth to parse
// one paragraph of text back out of it.
async function buildMinimalDocx(text: string): Promise<Buffer> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  )
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  )
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${text}</w:t></w:r></w:p>
  </w:body>
</w:document>`,
  )
  return zip.generateAsync({ type: 'nodebuffer' })
}

describe('inline comments', () => {
  const suffix = randomUUID().slice(0, 8)

  let categoryId: string
  let otherCategoryId: string
  let authorId: string
  let reviewerId: string
  let outsiderId: string
  let authorToken: string
  let reviewerToken: string
  let outsiderToken: string
  const documentIds: string[] = []

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('password123', 10)

    const category = await prisma.category.create({ data: { name: `Comments ${suffix}` } })
    const otherCategory = await prisma.category.create({ data: { name: `Comments Other ${suffix}` } })
    categoryId = category.id
    otherCategoryId = otherCategory.id

    const author = await prisma.user.create({
      data: { email: `comments-author-${suffix}@example.com`, passwordHash, role: 'AUTHOR' },
    })
    const reviewer = await prisma.user.create({
      data: { email: `comments-reviewer-${suffix}@example.com`, passwordHash, role: 'REVIEWER' },
    })
    const outsider = await prisma.user.create({
      data: { email: `comments-outsider-${suffix}@example.com`, passwordHash, role: 'REVIEWER' },
    })
    authorId = author.id
    reviewerId = reviewer.id
    outsiderId = outsider.id

    await prisma.categoryMembership.createMany({
      data: [
        { userId: authorId, categoryId },
        { userId: reviewerId, categoryId },
        { userId: outsiderId, categoryId: otherCategoryId },
      ],
    })

    authorToken = signAuthToken({ sub: authorId, role: 'AUTHOR' })
    reviewerToken = signAuthToken({ sub: reviewerId, role: 'REVIEWER' })
    outsiderToken = signAuthToken({ sub: outsiderId, role: 'REVIEWER' })
  })

  afterAll(async () => {
    await prisma.comment.deleteMany({ where: { version: { documentId: { in: documentIds } } } })
    await prisma.auditEvent.deleteMany({ where: { documentId: { in: documentIds } } })
    await prisma.approval.deleteMany({ where: { version: { documentId: { in: documentIds } } } })
    await prisma.review.deleteMany({ where: { version: { documentId: { in: documentIds } } } })
    await prisma.documentVersion.deleteMany({ where: { documentId: { in: documentIds } } })
    await prisma.document.deleteMany({ where: { id: { in: documentIds } } })
    await prisma.categoryMembership.deleteMany({
      where: { categoryId: { in: [categoryId, otherCategoryId] } },
    })
    await prisma.user.deleteMany({ where: { id: { in: [authorId, reviewerId, outsiderId] } } })
    await prisma.category.deleteMany({ where: { id: { in: [categoryId, otherCategoryId] } } })
  })

  async function createDocument(title: string, fileName: string, content: Buffer | string) {
    const create = await request(app)
      .post('/documents')
      .set('Authorization', `Bearer ${authorToken}`)
      .field('title', title)
      .field('categoryId', categoryId)
      .attach('file', Buffer.isBuffer(content) ? content : Buffer.from(content), fileName)
    documentIds.push(create.body.id)
    return create.body as { id: string; currentVersion: { id: string } }
  }

  it('renders .txt content verbatim', async () => {
    const doc = await createDocument('Text content', 'v1.txt', 'hello world\nsecond line')
    const res = await request(app)
      .get(`/versions/${doc.currentVersion.id}/content`)
      .set('Authorization', `Bearer ${authorToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ format: 'text', content: 'hello world\nsecond line' })
  })

  it('renders .md content as markdown source', async () => {
    const doc = await createDocument('Markdown content', 'v1.md', '# Title\n\nSome **bold** text')
    const res = await request(app)
      .get(`/versions/${doc.currentVersion.id}/content`)
      .set('Authorization', `Bearer ${authorToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ format: 'markdown', content: '# Title\n\nSome **bold** text' })
  })

  it('converts .docx to cached HTML', async () => {
    const docx = await buildMinimalDocx('Hello from docx')
    const doc = await createDocument('Docx content', 'v1.docx', docx)

    const res = await request(app)
      .get(`/versions/${doc.currentVersion.id}/content`)
      .set('Authorization', `Bearer ${authorToken}`)
    expect(res.status).toBe(200)
    expect(res.body.format).toBe('html')
    expect(res.body.content).toContain('Hello from docx')

    // Second call should hit the cache and return byte-identical HTML.
    const second = await request(app)
      .get(`/versions/${doc.currentVersion.id}/content`)
      .set('Authorization', `Bearer ${authorToken}`)
    expect(second.body.content).toBe(res.body.content)
  })

  it('renders .html content and strips scripts and event handlers', async () => {
    const doc = await createDocument(
      'Html content',
      'v1.html',
      '<p onclick="alert(1)">Hello <strong>world</strong></p><script>alert(1)</script>',
    )
    const res = await request(app)
      .get(`/versions/${doc.currentVersion.id}/content`)
      .set('Authorization', `Bearer ${authorToken}`)
    expect(res.status).toBe(200)
    expect(res.body.format).toBe('html')
    expect(res.body.content).toContain('Hello <strong>world</strong>')
    expect(res.body.content).not.toContain('<script')
    expect(res.body.content).not.toContain('onclick')
  })

  it('reports pdf as unsupported for inline rendering', async () => {
    const doc = await createDocument('Pdf content', 'v1.pdf', '%PDF-1.4 fake')
    const res = await request(app)
      .get(`/versions/${doc.currentVersion.id}/content`)
      .set('Authorization', `Bearer ${authorToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ format: 'unsupported', content: null })
  })

  it('lets a reviewer post a highlighted comment and both author and reviewer see it', async () => {
    const doc = await createDocument('Commentable doc', 'v1.txt', 'The quick brown fox jumps')
    await request(app).post(`/documents/${doc.id}/submit`).set('Authorization', `Bearer ${authorToken}`)

    const create = await request(app)
      .post(`/versions/${doc.currentVersion.id}/comments`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({
        body: 'Fix this word',
        anchorQuote: 'brown',
        anchorPrefix: 'The quick ',
        anchorSuffix: ' fox jumps',
        anchorStart: 10,
        anchorEnd: 15,
      })
    expect(create.status).toBe(201)
    expect(create.body.anchorQuote).toBe('brown')

    for (const token of [authorToken, reviewerToken]) {
      const list = await request(app)
        .get(`/versions/${doc.currentVersion.id}/comments`)
        .set('Authorization', `Bearer ${token}`)
      expect(list.status).toBe(200)
      expect(list.body.items).toHaveLength(1)
      expect(list.body.items[0].body).toBe('Fix this word')
      expect(list.body.items[0].author.id).toBe(reviewerId)
    }
  })

  it('rejects a comment from an author (reviewers only)', async () => {
    const doc = await createDocument('Author cannot comment', 'v1.txt', 'content')
    const res = await request(app)
      .post(`/versions/${doc.currentVersion.id}/comments`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ body: 'nope' })
    expect(res.status).toBe(403)
  })

  it('rejects a partial anchor — quote without offsets', async () => {
    const doc = await createDocument('Partial anchor', 'v1.txt', 'content')
    const res = await request(app)
      .post(`/versions/${doc.currentVersion.id}/comments`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ body: 'nope', anchorQuote: 'content' })
    expect(res.status).toBe(400)
  })

  it('accepts a version-level comment with no anchor at all (the PDF fallback)', async () => {
    const doc = await createDocument('Version level comment', 'v1.pdf', '%PDF-1.4 fake')
    await request(app).post(`/documents/${doc.id}/submit`).set('Authorization', `Bearer ${authorToken}`)
    const res = await request(app)
      .post(`/versions/${doc.currentVersion.id}/comments`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ body: 'General feedback on the whole document' })
    expect(res.status).toBe(201)
    expect(res.body.anchorQuote).toBeNull()
  })

  it('rejects commenting on an approved version and creates nothing', async () => {
    const doc = await createDocument('Approved lock', 'v1.txt', 'content')
    await request(app).post(`/documents/${doc.id}/submit`).set('Authorization', `Bearer ${authorToken}`)
    await request(app)
      .post(`/versions/${doc.currentVersion.id}/approve`)
      .set('Authorization', `Bearer ${reviewerToken}`)

    const res = await request(app)
      .post(`/versions/${doc.currentVersion.id}/comments`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ body: 'too late' })
    expect(res.status).toBe(409)

    const count = await prisma.comment.count({ where: { versionId: doc.currentVersion.id } })
    expect(count).toBe(0)
  })

  it('refuses content and comments to a reviewer outside the category — 404', async () => {
    const doc = await createDocument('Isolated doc', 'v1.txt', 'content')
    await request(app).post(`/documents/${doc.id}/submit`).set('Authorization', `Bearer ${authorToken}`)

    const contentRes = await request(app)
      .get(`/versions/${doc.currentVersion.id}/content`)
      .set('Authorization', `Bearer ${outsiderToken}`)
    expect(contentRes.status).toBe(404)

    const listRes = await request(app)
      .get(`/versions/${doc.currentVersion.id}/comments`)
      .set('Authorization', `Bearer ${outsiderToken}`)
    expect(listRes.status).toBe(404)

    const postRes = await request(app)
      .post(`/versions/${doc.currentVersion.id}/comments`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ body: 'not allowed' })
    expect(postRes.status).toBe(404)
  })

  it('keeps comments on the version they were made on — a new revision starts clean', async () => {
    const doc = await createDocument('Version scoped comments', 'v1.txt', 'content')
    await request(app).post(`/documents/${doc.id}/submit`).set('Authorization', `Bearer ${authorToken}`)
    const v1Id = doc.currentVersion.id

    await request(app)
      .post(`/versions/${v1Id}/comments`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ body: 'comment on v1' })

    const upload = await request(app)
      .post(`/documents/${doc.id}/versions`)
      .set('Authorization', `Bearer ${authorToken}`)
      .attach('file', Buffer.from('v2 content'), 'v2.txt')
    const v2Id = upload.body.id as string

    const v1Comments = await request(app)
      .get(`/versions/${v1Id}/comments`)
      .set('Authorization', `Bearer ${authorToken}`)
    expect(v1Comments.body.items).toHaveLength(1)
    expect(v1Comments.body.items[0].body).toBe('comment on v1')

    const v2Comments = await request(app)
      .get(`/versions/${v2Id}/comments`)
      .set('Authorization', `Bearer ${authorToken}`)
    expect(v2Comments.body.items).toHaveLength(0)
  })
})
