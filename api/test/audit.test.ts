import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import { createFixtures, type TestActor } from './support/fixtures.js'
import { requestChanges, submitDocument, uploadDocument, uploadRevision } from './support/http.js'

describe('audit trail', () => {
  const fixtures = createFixtures('Audit')
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

  it('records one row per tracked action, newest first, and hides it from non-members', async () => {
    const create = await uploadDocument(author.token, { title: 'Audited document', categoryId })
    const documentId = create.body.id as string
    const v1VersionId = create.body.currentVersion.id as string
    documentIds.push(documentId)

    await submitDocument(author.token, documentId)
    await requestChanges(reviewer.token, v1VersionId, 'fix the intro')
    await uploadRevision(author.token, documentId)

    const res = await request(app)
      .get(`/documents/${documentId}/audit`)
      .set('Cookie', `auth_token=${author.token}`)

    expect(res.status).toBe(200)
    const actions = res.body.items.map((e: { action: string }) => e.action)
    expect(actions).toEqual([
      'VERSION_UPLOADED',
      'VERSION_SUPERSEDED',
      'CHANGES_REQUESTED',
      'SUBMITTED',
      'DOCUMENT_UPLOADED',
    ])

    const timestamps = res.body.items.map((e: { timestamp: string }) => new Date(e.timestamp).getTime())
    expect([...timestamps].sort((a, b) => b - a)).toEqual(timestamps)

    const refused = await request(app)
      .get(`/documents/${documentId}/audit`)
      .set('Cookie', `auth_token=${outsider.token}`)
    expect(refused.status).toBe(404)
  })

  it('paginates the audit trail by cursor', async () => {
    const create = await uploadDocument(author.token, { title: 'Long audit trail', categoryId })
    const documentId = create.body.id as string
    documentIds.push(documentId)

    await submitDocument(author.token, documentId)
    for (let i = 0; i < 3; i++) {
      await uploadRevision(author.token, documentId, { fileName: `v${i + 2}.txt`, content: `v${i + 2} content` })
    }

    const firstPage = await request(app)
      .get(`/documents/${documentId}/audit?limit=2`)
      .set('Cookie', `auth_token=${author.token}`)
    expect(firstPage.body.items).toHaveLength(2)
    expect(firstPage.body.nextCursor).not.toBeNull()

    const secondPage = await request(app)
      .get(`/documents/${documentId}/audit?limit=2&cursor=${firstPage.body.nextCursor}`)
      .set('Cookie', `auth_token=${author.token}`)
    expect(secondPage.body.items).toHaveLength(2)

    const firstIds = firstPage.body.items.map((e: { id: string }) => e.id)
    const secondIds = secondPage.body.items.map((e: { id: string }) => e.id)
    expect(firstIds.some((id: string) => secondIds.includes(id))).toBe(false)
  })
})
