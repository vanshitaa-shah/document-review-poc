import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.ts'
import { signAuthToken } from '../src/lib/jwt.ts'
import { prisma } from '../src/lib/prisma.ts'
import { createFixtures, TEST_PASSWORD, type TestActor } from './support/fixtures.ts'
import { authCookie, extractAuthCookie } from './support/http.ts'

describe('admin: create users', () => {
  const fixtures = createFixtures('Admin')
  const { suffix } = fixtures
  const createdEmails: string[] = []

  let categoryId: string
  let otherCategoryId: string
  let author: TestActor
  let adminId: string
  let adminToken: string

  beforeAll(async () => {
    categoryId = await fixtures.category('Primary')
    otherCategoryId = await fixtures.category('Other')
    author = await fixtures.actor('AUTHOR', 'author', categoryId)

    const admin = await prisma.user.create({
      data: { email: `admin-${suffix}@example.com`, passwordHash: 'unused', role: { connect: { name: 'ADMIN' } } },
    })
    adminId = admin.id
    adminToken = signAuthToken({ sub: admin.id, role: 'ADMIN' })
  })

  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { in: createdEmails } }, select: { id: true } })
    const ids = [...users.map((u) => u.id), adminId]
    await prisma.categoryMembership.deleteMany({ where: { userId: { in: ids } } })
    await prisma.user.deleteMany({ where: { id: { in: ids } } })
    await fixtures.cleanup()
  })

  function newEmail(label: string) {
    const email = `${label}-${suffix}-${randomUUID().slice(0, 4)}@example.com`
    createdEmails.push(email)
    return email
  }

  function createUser(token: string, body: Record<string, unknown>) {
    return request(app).post('/admin/users').set('Cookie', authCookie(token)).send(body)
  }

  it('creates a user with memberships, who can then log in with the chosen password', async () => {
    const email = newEmail('reviewer')

    const res = await createUser(adminToken, {
      email,
      password: 'chosen-password',
      role: 'REVIEWER',
      categoryIds: [categoryId],
    })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ email, role: 'REVIEWER' })
    expect(res.body.passwordHash).toBeUndefined()

    const memberships = await prisma.categoryMembership.findMany({ where: { userId: res.body.id } })
    expect(memberships.map((m) => m.categoryId)).toEqual([categoryId])

    const login = await request(app).post('/auth/login').send({ email, password: 'chosen-password' })
    expect(login.status).toBe(200)
    expect(login.body.user.role).toBe('REVIEWER')
    expect(extractAuthCookie(login)).toBeTruthy()
  })

  it('lets an author belong to several categories but limits a reviewer to one', async () => {
    const authorRes = await createUser(adminToken, {
      email: newEmail('multi-author'),
      password: TEST_PASSWORD,
      role: 'AUTHOR',
      categoryIds: [categoryId, otherCategoryId],
    })
    expect(authorRes.status).toBe(201)
    expect(await prisma.categoryMembership.count({ where: { userId: authorRes.body.id } })).toBe(2)

    const reviewerEmail = newEmail('multi-reviewer')
    const reviewerRes = await createUser(adminToken, {
      email: reviewerEmail,
      password: TEST_PASSWORD,
      role: 'REVIEWER',
      categoryIds: [categoryId, otherCategoryId],
    })
    expect(reviewerRes.status).toBe(400)
    expect(await prisma.user.count({ where: { email: reviewerEmail } })).toBe(0)
  })

  it('stores a hash, never the plain password, and lowercases the email', async () => {
    const email = newEmail('Mixed')
    const res = await createUser(adminToken, {
      email: email.toUpperCase(),
      password: TEST_PASSWORD,
      role: 'AUTHOR',
      categoryIds: [categoryId],
    })

    expect(res.status).toBe(201)
    expect(res.body.email).toBe(email.toLowerCase())
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: res.body.id } })
    expect(stored.passwordHash).not.toBe(TEST_PASSWORD)
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/)
  })

  it('rejects a duplicate email with 409 and creates nothing extra', async () => {
    const email = newEmail('dup')
    const body = { email, password: TEST_PASSWORD, role: 'AUTHOR', categoryIds: [categoryId] }

    expect((await createUser(adminToken, body)).status).toBe(201)
    const second = await createUser(adminToken, body)

    expect(second.status).toBe(409)
    expect(await prisma.user.count({ where: { email } })).toBe(1)
  })

  it('creates exactly one user when the same email is submitted twice at once', async () => {
    const email = newEmail('concurrent')
    const body = { email, password: TEST_PASSWORD, role: 'AUTHOR', categoryIds: [categoryId] }

    const results = await Promise.all([createUser(adminToken, body), createUser(adminToken, body)])

    expect(results.map((r) => r.status).sort()).toEqual([201, 409])
    expect(await prisma.user.count({ where: { email } })).toBe(1)
  })

  it('rejects an unknown category with 400 and creates no user', async () => {
    const email = newEmail('badcat')

    const res = await createUser(adminToken, {
      email,
      password: TEST_PASSWORD,
      role: 'AUTHOR',
      categoryIds: [categoryId, randomUUID()],
    })

    expect(res.status).toBe(400)
    expect(await prisma.user.count({ where: { email } })).toBe(0)
  })

  it('rejects bad input: short password, no categories, ADMIN role, bad email', async () => {
    const base = { email: newEmail('invalid'), password: TEST_PASSWORD, role: 'AUTHOR', categoryIds: [categoryId] }

    expect((await createUser(adminToken, { ...base, password: 'short' })).status).toBe(400)
    expect((await createUser(adminToken, { ...base, categoryIds: [] })).status).toBe(400)
    expect((await createUser(adminToken, { ...base, role: 'ADMIN' })).status).toBe(400)
    expect((await createUser(adminToken, { ...base, email: 'not-an-email' })).status).toBe(400)
    expect(await prisma.user.count({ where: { email: base.email } })).toBe(0)
  })

  it('refuses non-admins with 403 and no token with 401', async () => {
    const body = { email: newEmail('forbidden'), password: TEST_PASSWORD, role: 'AUTHOR', categoryIds: [categoryId] }

    expect((await createUser(author.token, body)).status).toBe(403)
    expect((await request(app).post('/admin/users').send(body)).status).toBe(401)
    expect(await prisma.user.count({ where: { email: body.email } })).toBe(0)
  })

  it('lists every category for an admin, but only their own for an author', async () => {
    const asAdmin = await request(app).get('/categories').set('Cookie', authCookie(adminToken))
    expect(asAdmin.status).toBe(200)
    const adminIds = asAdmin.body.items.map((c: { id: string }) => c.id)
    expect(adminIds).toEqual(expect.arrayContaining([categoryId, otherCategoryId]))

    const asAuthor = await request(app).get('/categories').set('Cookie', authCookie(author.token))
    expect(asAuthor.body.items.map((c: { id: string }) => c.id)).toEqual([categoryId])
  })

  it('gives an admin no document access: category-scoped lists come back empty', async () => {
    const docs = await request(app).get('/documents').set('Cookie', authCookie(adminToken))
    expect(docs.status).toBe(200)
    expect(docs.body.items).toEqual([])

    const queue = await request(app).get('/reviews/queue')
      .set('Cookie', authCookie(adminToken))
    expect(queue.status).toBe(403)
  })
})
