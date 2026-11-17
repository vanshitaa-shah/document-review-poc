import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { Notification } from '@prisma/client'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.ts'
import { subscribeToNotifications } from '../src/lib/events.ts'
import { prisma } from '../src/lib/prisma.ts'
import { createFixtures, type TestActor } from './support/fixtures.ts'
import {
  approveVersion,
  authCookie,
  createDocument,
  createSubmittedDocument,
  requestChanges,
  submitDocument,
  uploadRevision,
} from './support/http.ts'

describe('notifications', () => {
  const fixtures = createFixtures('Notif')
  const { documentIds } = fixtures

  let categoryId: string
  let otherCategoryId: string
  let author: TestActor
  let reviewer: TestActor
  let secondReviewer: TestActor
  let outsider: TestActor

  beforeAll(async () => {
    categoryId = await fixtures.category('Primary')
    otherCategoryId = await fixtures.category('Other')
    author = await fixtures.actor('AUTHOR', 'author', categoryId)
    reviewer = await fixtures.actor('REVIEWER', 'reviewer', categoryId)
    secondReviewer = await fixtures.actor('REVIEWER', 'second-reviewer', categoryId)
    outsider = await fixtures.actor('REVIEWER', 'outsider', otherCategoryId)
  })

  afterAll(fixtures.cleanup)

  async function seedSubmitted() {
    const doc = await createSubmittedDocument(author.token, { title: `Notif ${randomUUID()}`, categoryId })
    documentIds.push(doc.id)
    return doc
  }

  function notificationsFor(documentId: string, userId: string) {
    return prisma.notification.findMany({ where: { documentId, userId }, orderBy: { createdAt: 'asc' } })
  }

  it('tells category reviewers a document was submitted — not the author, not another category', async () => {
    const doc = await seedSubmitted()

    for (const r of [reviewer, secondReviewer]) {
      const rows = await notificationsFor(doc.id, r.id)
      expect(rows.map((n) => n.type)).toEqual(['SUBMITTED'])
    }
    expect(await notificationsFor(doc.id, author.id)).toHaveLength(0)
    expect(await notificationsFor(doc.id, outsider.id)).toHaveLength(0)
  })

  it('does not notify anyone for a draft nobody has submitted yet', async () => {
    const doc = await createDocument(author.token, { title: `Notif ${randomUUID()}`, categoryId })
    documentIds.push(doc.id)

    expect(await prisma.notification.count({ where: { documentId: doc.id } })).toBe(0)
  })

  it('tells the author when changes are requested', async () => {
    const doc = await seedSubmitted()
    const res = await requestChanges(reviewer.token, doc.currentVersion.id, 'please fix')
    expect(res.status).toBe(204)

    const rows = await notificationsFor(doc.id, author.id)
    expect(rows.map((n) => n.type)).toEqual(['CHANGES_REQUESTED'])
    expect(rows[0]!.actorId).toBe(reviewer.id)
  })

  it('tells the author and the other category reviewers when a version is approved', async () => {
    const doc = await seedSubmitted()
    const res = await approveVersion(secondReviewer.token, doc.currentVersion.id)
    expect(res.status).toBe(204)

    expect((await notificationsFor(doc.id, author.id)).map((n) => n.type)).toContain('APPROVED')
    expect((await notificationsFor(doc.id, reviewer.id)).map((n) => n.type)).toContain('APPROVED')
    // the approver is the actor, and another category's reviewer never hears about it
    expect((await notificationsFor(doc.id, secondReviewer.id)).map((n) => n.type)).not.toContain('APPROVED')
    expect(await notificationsFor(doc.id, outsider.id)).toHaveLength(0)
  })

  it('tells a reviewer mid-review that their version was superseded, and the rest that a new one is up', async () => {
    const doc = await seedSubmitted()
    await requestChanges(reviewer.token, doc.currentVersion.id, 'needs work')
    expect((await uploadRevision(author.token, doc.id)).status).toBe(201)
    expect((await submitDocument(author.token, doc.id)).status).toBe(204)

    const engaged = await notificationsFor(doc.id, reviewer.id)
    expect(engaged.map((n) => n.type)).toEqual(['SUBMITTED', 'VERSION_SUPERSEDED'])
    const bystander = await notificationsFor(doc.id, secondReviewer.id)
    expect(bystander.map((n) => n.type)).toEqual(['SUBMITTED', 'SUBMITTED'])
  })

  it('writes and publishes nothing when the action is rejected as stale', async () => {
    const doc = await seedSubmitted()
    await approveVersion(reviewer.token, doc.currentVersion.id)

    const before = await prisma.notification.count({ where: { documentId: doc.id } })
    const pushed: Notification[] = []
    const unsubscribe = subscribeToNotifications(author.id, (n) => pushed.push(n))

    const res = await approveVersion(secondReviewer.token, doc.currentVersion.id)
    unsubscribe()

    expect(res.status).toBe(409)
    expect(await prisma.notification.count({ where: { documentId: doc.id } })).toBe(before)
    expect(pushed).toHaveLength(0)
  })

  it('publishes to the live stream once the action has committed', async () => {
    const doc = await seedSubmitted()
    const pushed: Notification[] = []
    const unsubscribe = subscribeToNotifications(author.id, (n) => pushed.push(n))

    await requestChanges(reviewer.token, doc.currentVersion.id, 'live one')
    unsubscribe()

    expect(pushed).toHaveLength(1)
    expect(pushed[0]).toMatchObject({ type: 'CHANGES_REQUESTED', documentId: doc.id, userId: author.id })
    // what was pushed is what was committed
    expect(await prisma.notification.findUnique({ where: { id: pushed[0]!.id } })).not.toBeNull()
  })

  it('delivers a notification to an open SSE connection as it happens', async () => {
    const doc = await seedSubmitted()
    const server = app.listen(0)
    const abort = new AbortController()
    try {
      const { port } = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${port}/notifications/stream`, {
        headers: { Cookie: authCookie(author.token) },
        signal: abort.signal,
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/event-stream')

      await requestChanges(reviewer.token, doc.currentVersion.id, 'over the wire')

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let received = ''
      while (!received.includes('event: notification')) {
        const { value, done } = await reader.read()
        if (done) break
        received += decoder.decode(value)
      }
      const data = received.split('\n').find((line) => line.startsWith('data: '))!
      expect(JSON.parse(data.slice(6))).toMatchObject({ type: 'CHANGES_REQUESTED', documentId: doc.id })
    } finally {
      abort.abort()
      server.close()
    }
  })

  it('lists only the caller’s notifications with an unread count, and marks them read', async () => {
    const doc = await seedSubmitted()

    const list = await request(app).get('/notifications').set('Cookie', authCookie(reviewer.token))
    expect(list.status).toBe(200)
    const mine = (list.body.items as Notification[]).filter((n) => n.documentId === doc.id)
    expect(mine).toHaveLength(1)
    expect((list.body.items as Notification[]).every((n) => n.userId === reviewer.id)).toBe(true)
    expect(list.body.unreadCount).toBeGreaterThan(0)

    const read = await request(app)
      .post(`/notifications/${mine[0]!.id}/read`)
      .set('Cookie', authCookie(reviewer.token))
    expect(read.status).toBe(204)

    const unread = await request(app).get('/notifications?unread=true').set('Cookie', authCookie(reviewer.token))
    expect((unread.body.items as Notification[]).some((n) => n.id === mine[0]!.id)).toBe(false)

    const all = await request(app).post('/notifications/read-all').set('Cookie', authCookie(reviewer.token))
    expect(all.status).toBe(204)
    const after = await request(app).get('/notifications').set('Cookie', authCookie(reviewer.token))
    expect(after.body.unreadCount).toBe(0)
  })

  it('404s when marking someone else’s notification read', async () => {
    const doc = await seedSubmitted()
    const [theirs] = await notificationsFor(doc.id, reviewer.id)

    const res = await request(app)
      .post(`/notifications/${theirs!.id}/read`)
      .set('Cookie', authCookie(outsider.token))
    expect(res.status).toBe(404)
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: theirs!.id } })).readAt).toBeNull()
  })

  it('requires authentication on every notification route', async () => {
    expect((await request(app).get('/notifications')).status).toBe(401)
    expect((await request(app).get('/notifications/stream')).status).toBe(401)
    expect((await request(app).post('/notifications/read-all')).status).toBe(401)
  })

  it('emits exactly one APPROVED notification per recipient when two approvals land at once', async () => {
    for (let i = 0; i < 10; i++) {
      const doc = await seedSubmitted()
      const [a, b] = await Promise.all([
        approveVersion(reviewer.token, doc.currentVersion.id),
        approveVersion(secondReviewer.token, doc.currentVersion.id),
      ])
      expect([a.status, b.status].sort()).toEqual([204, 409])

      const approved = await prisma.notification.findMany({ where: { documentId: doc.id, type: 'APPROVED' } })
      expect(approved.filter((n) => n.userId === author.id)).toHaveLength(1)
    }
  }, 300000)
})
