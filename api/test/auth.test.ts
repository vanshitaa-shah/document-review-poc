import { randomUUID } from 'node:crypto'
import bcrypt from 'bcrypt'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'

describe('POST /auth/login', () => {
  const email = `login-${randomUUID().slice(0, 8)}@example.com`
  const password = 'password123'
  let userId: string

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: { email, passwordHash, role: 'REVIEWER' },
    })
    userId = user.id
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } })
  })

  it('sets an httpOnly auth cookie for correct credentials', async () => {
    const res = await request(app).post('/auth/login').send({ email, password })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeUndefined()
    expect(res.body.user).toMatchObject({ id: userId, email, role: 'REVIEWER' })

    const cookies = res.headers['set-cookie'] as unknown as string[]
    const authCookie = cookies?.find((c) => c.startsWith('auth_token='))
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
      .send({ email: 'nobody@example.com', password })

    expect(res.status).toBe(401)
  })

  it('400s on a malformed body', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'not-an-email' })

    expect(res.status).toBe(400)
  })

  it('the cookie set by login authenticates a subsequent request', async () => {
    const login = await request(app).post('/auth/login').send({ email, password })
    const cookies = login.headers['set-cookie'] as unknown as string[]
    const authCookie = cookies.find((c) => c.startsWith('auth_token='))!

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
    const cookies = res.headers['set-cookie'] as unknown as string[]
    const authCookie = cookies?.find((c) => c.startsWith('auth_token='))
    expect(authCookie).toBeDefined()
    // clearCookie re-sets the cookie with an already-past expiry, not a real value.
    expect(authCookie).toMatch(/auth_token=;/)
  })
})
