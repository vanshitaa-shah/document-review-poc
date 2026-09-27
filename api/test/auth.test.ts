import { randomUUID } from 'node:crypto'
import bcrypt from 'bcrypt'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import { TEST_PASSWORD } from './support/fixtures.js'
import { extractAuthCookie, findAuthCookie } from './support/http.js'

describe('POST /auth/login', () => {
  const email = `login-${randomUUID().slice(0, 8)}@example.com`
  let userId: string

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
    const user = await prisma.user.create({
      data: { email, passwordHash, role: 'REVIEWER' },
    })
    userId = user.id
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } })
  })

  it('sets an httpOnly auth cookie for correct credentials', async () => {
    const res = await request(app).post('/auth/login').send({ email, password: TEST_PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeUndefined()
    expect(res.body.user).toMatchObject({ id: userId, email, role: 'REVIEWER' })

    const authCookie = findAuthCookie(res)
    expect(authCookie).toBeDefined()
    expect(authCookie).toContain('HttpOnly')
    expect(authCookie).toMatch(/SameSite=Lax/i)
  })

  it('rejects a wrong password', async () => {
    const res = await request(app).post('/auth/login').send({ email, password: 'wrong' })

    expect(res.status).toBe(401)
  })

  it('rejects an unknown email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: TEST_PASSWORD })

    expect(res.status).toBe(401)
  })

  it('400s on a malformed body', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'not-an-email' })

    expect(res.status).toBe(400)
  })

  it('the cookie set by login authenticates a subsequent request', async () => {
    const login = await request(app).post('/auth/login').send({ email, password: TEST_PASSWORD })
    const authCookie = extractAuthCookie(login)

    const res = await request(app).get('/documents').set('Cookie', authCookie)
    expect(res.status).toBe(200)
  })

  it('rejects a request with no auth cookie at all', async () => {
    const res = await request(app).get('/documents')
    expect(res.status).toBe(401)
  })
})

describe('POST /auth/logout', () => {
  it('clears the auth cookie', async () => {
    const res = await request(app).post('/auth/logout')

    expect(res.status).toBe(204)
    const authCookie = findAuthCookie(res)
    expect(authCookie).toBeDefined()
    // clearCookie re-sets the cookie with an already-past expiry, not a real value.
    expect(authCookie).toMatch(/auth_token=;/)
  })
})
