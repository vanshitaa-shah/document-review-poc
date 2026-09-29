import JSZip from 'jszip'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.ts'
import { prisma } from '../src/lib/prisma.ts'
import { createFixtures, type TestActor } from './support/fixtures.ts'
import { createDocument, submitDocument, uploadDocument } from './support/http.ts'

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
  const fixtures = createFixtures('Comments')
  const { documentIds } = fixtures

  let categoryId: string
  let otherCategoryId: string
  let author: TestActor
  let reviewer: TestActor
  let outsider: TestActor

  beforeAll(async () => {
    categoryId = await fixtures.category('Primary')
    otherCategoryId = await fixtures.category('Other')
    author = await fixtures.actor('AUTHOR', 'author', categoryId)
    reviewer = await fixtures.actor('REVIEWER', 'reviewer', categoryId)
    outsider = await fixtures.actor('REVIEWER', 'outsider', otherCategoryId)
  })

  afterAll(fixtures.cleanup)

  async function document(title: string, fileName: string, content: Buffer | string) {
    const doc = await createDocument(author.token, { title, categoryId, fileName, content })
    documentIds.push(doc.id)
    return doc
  }

  it('renders .txt content verbatim', async () => {
    const doc = await document('Text content', 'v1.txt', 'hello world\nsecond line')
    const res = await request(app)
      .get(`/versions/${doc.currentVersion.id}/content`)
      .set('Cookie', `auth_token=${author.token}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ format: 'text', content: 'hello world\nsecond line' })
  })

  it('renders .md content as markdown source', async () => {
    const doc = await document('Markdown content', 'v1.md', '# Title\n\nSome **bold** text')
    const res = await request(app)
      .get(`/versions/${doc.currentVersion.id}/content`)
      .set('Cookie', `auth_token=${author.token}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ format: 'markdown', content: '# Title\n\nSome **bold** text' })
  })

  it('converts .docx to cached HTML', async () => {
    const docx = await buildMinimalDocx('Hello from docx')
    const doc = await document('Docx content', 'v1.docx', docx)

    const res = await request(app)
      .get(`/versions/${doc.currentVersion.id}/content`)
      .set('Cookie', `auth_token=${author.token}`)
    expect(res.status).toBe(200)
    expect(res.body.format).toBe('html')
    expect(res.body.content).toContain('Hello from docx')

    // Second call should hit the cache and return byte-identical HTML.
    const second = await request(app)
      .get(`/versions/${doc.currentVersion.id}/content`)
      .set('Cookie', `auth_token=${author.token}`)
    expect(second.body.content).toBe(res.body.content)
  })

  it('renders .html content and strips scripts and event handlers', async () => {
    const doc = await document(
      'Html content',
      'v1.html',
      '<p onclick="alert(1)">Hello <strong>world</strong></p><script>alert(1)</script>',
    )
    const res = await request(app)
      .get(`/versions/${doc.currentVersion.id}/content`)
      .set('Cookie', `auth_token=${author.token}`)
    expect(res.status).toBe(200)
    expect(res.body.format).toBe('html')
    expect(res.body.content).toContain('Hello <strong>world</strong>')
    expect(res.body.content).not.toContain('<script')
    expect(res.body.content).not.toContain('onclick')
  })

  it('rejects an unsupported file extension at upload, before any document is created', async () => {
    const res = await uploadDocument(author.token, {
      title: 'Pdf content',
      categoryId,
      fileName: 'v1.pdf',
      content: '%PDF-1.4 fake',
    })
    expect(res.status).toBe(400)
  })

  it('lets a reviewer post a highlighted comment and both author and reviewer see it', async () => {
    const doc = await document('Commentable doc', 'v1.txt', 'The quick brown fox jumps')
    await submitDocument(author.token, doc.id)

    const create = await request(app)
      .post(`/versions/${doc.currentVersion.id}/comments`)
      .set('Cookie', `auth_token=${reviewer.token}`)
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

    for (const token of [author.token, reviewer.token]) {
      const list = await request(app)
        .get(`/versions/${doc.currentVersion.id}/comments`)
        .set('Cookie', `auth_token=${token}`)
      expect(list.status).toBe(200)
      expect(list.body.items).toHaveLength(1)
      expect(list.body.items[0].body).toBe('Fix this word')
      expect(list.body.items[0].author.id).toBe(reviewer.id)
    }
  })

  it('rejects a comment from an author (reviewers only)', async () => {
    const doc = await document('Author cannot comment', 'v1.txt', 'content')
    const res = await request(app)
      .post(`/versions/${doc.currentVersion.id}/comments`)
      .set('Cookie', `auth_token=${author.token}`)
      .send({ body: 'nope' })
    expect(res.status).toBe(403)
  })

  it('rejects a partial anchor — quote without offsets', async () => {
    const doc = await document('Partial anchor', 'v1.txt', 'content')
    const res = await request(app)
      .post(`/versions/${doc.currentVersion.id}/comments`)
      .set('Cookie', `auth_token=${reviewer.token}`)
      .send({ body: 'nope', anchorQuote: 'content' })
    expect(res.status).toBe(400)
  })

  it('rejects a comment with no anchor at all — there is no version-level comment', async () => {
    const doc = await document('No anchor', 'v1.txt', 'content')
    await submitDocument(author.token, doc.id)
    const res = await request(app)
      .post(`/versions/${doc.currentVersion.id}/comments`)
      .set('Cookie', `auth_token=${reviewer.token}`)
      .send({ body: 'General feedback on the whole document' })
    expect(res.status).toBe(400)
  })

  it('lets a second reviewer in the same category comment on top of the first', async () => {
    const doc = await document('Multiple reviewers', 'v1.txt', 'The quick brown fox jumps')
    await submitDocument(author.token, doc.id)

    const secondReviewer = await fixtures.actor('REVIEWER', 'reviewer2', categoryId)

    for (const [token, quote, start, end] of [
      [reviewer.token, 'quick', 4, 9],
      [secondReviewer.token, 'brown', 10, 15],
    ] as const) {
      const res = await request(app)
        .post(`/versions/${doc.currentVersion.id}/comments`)
        .set('Cookie', `auth_token=${token}`)
        .send({ body: `comment on ${quote}`, anchorQuote: quote, anchorStart: start, anchorEnd: end })
      expect(res.status).toBe(201)
    }

    const list = await request(app)
      .get(`/versions/${doc.currentVersion.id}/comments`)
      .set('Cookie', `auth_token=${author.token}`)
    expect(list.body.items).toHaveLength(2)
  })

  it('rejects commenting on an approved version and creates nothing', async () => {
    const doc = await document('Approved lock', 'v1.txt', 'content')
    await submitDocument(author.token, doc.id)
    await request(app)
      .post(`/versions/${doc.currentVersion.id}/approve`)
      .set('Cookie', `auth_token=${reviewer.token}`)

    const res = await request(app)
      .post(`/versions/${doc.currentVersion.id}/comments`)
      .set('Cookie', `auth_token=${reviewer.token}`)
      .send({ body: 'too late', anchorQuote: 'content', anchorStart: 0, anchorEnd: 7 })
    expect(res.status).toBe(409)

    const count = await prisma.comment.count({ where: { versionId: doc.currentVersion.id } })
    expect(count).toBe(0)
  })

  it('rejects commenting on a superseded version and creates nothing', async () => {
    const doc = await document('Superseded lock', 'v1.txt', 'content')
    const v1Id = doc.currentVersion.id
    await submitDocument(author.token, doc.id)

    await request(app)
      .post(`/documents/${doc.id}/versions`)
      .set('Cookie', `auth_token=${author.token}`)
      .attach('file', Buffer.from('v2 content'), 'v2.txt')
    await submitDocument(author.token, doc.id)

    const res = await request(app)
      .post(`/versions/${v1Id}/comments`)
      .set('Cookie', `auth_token=${reviewer.token}`)
      .send({ body: 'too late', anchorQuote: 'content', anchorStart: 0, anchorEnd: 7 })
    expect(res.status).toBe(409)

    const count = await prisma.comment.count({ where: { versionId: v1Id } })
    expect(count).toBe(0)
  })

  it('refuses content and comments to a reviewer outside the category — 404', async () => {
    const doc = await document('Isolated doc', 'v1.txt', 'content')
    await submitDocument(author.token, doc.id)

    const contentRes = await request(app)
      .get(`/versions/${doc.currentVersion.id}/content`)
      .set('Cookie', `auth_token=${outsider.token}`)
    expect(contentRes.status).toBe(404)

    const listRes = await request(app)
      .get(`/versions/${doc.currentVersion.id}/comments`)
      .set('Cookie', `auth_token=${outsider.token}`)
    expect(listRes.status).toBe(404)

    const postRes = await request(app)
      .post(`/versions/${doc.currentVersion.id}/comments`)
      .set('Cookie', `auth_token=${outsider.token}`)
      .send({ body: 'not allowed', anchorQuote: 'content', anchorStart: 0, anchorEnd: 7 })
    expect(postRes.status).toBe(404)
  })

  it('keeps comments on the version they were made on — a new revision starts clean', async () => {
    const doc = await document('Version scoped comments', 'v1.txt', 'content')
    await submitDocument(author.token, doc.id)
    const v1Id = doc.currentVersion.id

    await request(app)
      .post(`/versions/${v1Id}/comments`)
      .set('Cookie', `auth_token=${reviewer.token}`)
      .send({ body: 'comment on v1', anchorQuote: 'content', anchorStart: 0, anchorEnd: 7 })

    const upload = await request(app)
      .post(`/documents/${doc.id}/versions`)
      .set('Cookie', `auth_token=${author.token}`)
      .attach('file', Buffer.from('v2 content'), 'v2.txt')
    const v2Id = upload.body.id as string

    const v1Comments = await request(app)
      .get(`/versions/${v1Id}/comments`)
      .set('Cookie', `auth_token=${author.token}`)
    expect(v1Comments.body.items).toHaveLength(1)
    expect(v1Comments.body.items[0].body).toBe('comment on v1')

    const v2Comments = await request(app)
      .get(`/versions/${v2Id}/comments`)
      .set('Cookie', `auth_token=${author.token}`)
    expect(v2Comments.body.items).toHaveLength(0)
  })
})
