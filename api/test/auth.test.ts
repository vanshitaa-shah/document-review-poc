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

  it('issues a token for correct credentials', async () => {
    const res = await request(app).post('/auth/login').send({ email, password })

    expect(res.status).toBe(200)
    expect(typeof res.body.token).toBe('string')
    expect(res.body.user).toMatchObject({ id: userId, email, role: 'REVIEWER' })
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
})
