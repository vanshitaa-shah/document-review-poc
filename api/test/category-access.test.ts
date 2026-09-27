import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.ts'
import { prisma } from '../src/lib/prisma.ts'
import { createFixtures, type TestActor } from './support/fixtures.ts'

describe('category isolation', () => {
  const fixtures = createFixtures('Isolation')

  let author: TestActor
  let memberReviewer: TestActor
  let outsiderReviewer: TestActor
  let documentId: string

  beforeAll(async () => {
    const memberCategoryId = await fixtures.category('Member')
    const outsiderCategoryId = await fixtures.category('Outsider')

    author = await fixtures.actor('AUTHOR', 'author', memberCategoryId)
    memberReviewer = await fixtures.actor('REVIEWER', 'member', memberCategoryId)
    outsiderReviewer = await fixtures.actor('REVIEWER', 'outsider', outsiderCategoryId)

    const document = await prisma.document.create({
      data: {
        title: 'Isolation doc',
        categoryId: memberCategoryId,
        authorId: author.id,
        versions: {
          create: {
            versionNumber: 1,
            filePath: '/tmp/isolation-doc',
            fileName: 'doc.txt',
            mimeType: 'text/plain',
            size: 3,
            sha256: 'x',
            uploadedById: author.id,
            isCurrent: true,
            status: 'SUBMITTED',
          },
        },
      },
    })
    documentId = document.id
    fixtures.documentIds.push(documentId)
  })

  afterAll(fixtures.cleanup)

  it('lets a category member load the document', async () => {
    const res = await request(app)
      .get(`/documents/${documentId}`)
      .set('Cookie', `auth_token=${memberReviewer.token}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(documentId)
  })

  it('never loads the row for a non-member, even by direct id', async () => {
    const res = await request(app)
      .get(`/documents/${documentId}`)
      .set('Cookie', `auth_token=${outsiderReviewer.token}`)

    expect(res.status).toBe(404)
  })

  it('rejects requests with no token', async () => {
    const res = await request(app).get(`/documents/${documentId}`)

    expect(res.status).toBe(401)
  })
})
