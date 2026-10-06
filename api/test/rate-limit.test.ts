import express from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Counters live in each limiter's module-level memory, so every test loads a fresh copy
// of rateLimit.ts (and the app) — otherwise one test's requests count against the next.
async function load() {
  vi.resetModules()
  return import('../src/lib/rateLimit.ts')
}

// A throwaway app with one route behind the limiter under test, so these tests don't
// need a database, auth or real uploads just to count requests.
function appWith(limiter: express.RequestHandler) {
  const app = express()
  app.post('/hit', limiter, (_req, res) => {
    res.status(204).send()
  })
  return app
}

describe('rate limiting', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is off by default under test, so race tests are never throttled', async () => {
    const { loginLimiter } = await load()
    const app = appWith(loginLimiter)

    for (let i = 0; i < 15; i++) {
      expect((await request(app).post('/hit')).status).toBe(204)
    }
  })

  describe('when enabled', () => {
    const enable = () => vi.stubEnv('RATE_LIMIT_IN_TEST', 'true')

    it('blocks login after 10 attempts with a 429 and a message', async () => {
      enable()
      const { loginLimiter } = await load()
      const app = appWith(loginLimiter)

      for (let i = 0; i < 10; i++) {
        expect((await request(app).post('/hit')).status).toBe(204)
      }
      const blocked = await request(app).post('/hit')
      expect(blocked.status).toBe(429)
      expect(blocked.body.error).toMatch(/login attempts/i)
      expect(blocked.headers['ratelimit']).toBeDefined()
    })

    it('blocks uploads after 20 per window', async () => {
      enable()
      const { uploadLimiter } = await load()
      const app = appWith(uploadLimiter)

      for (let i = 0; i < 20; i++) {
        expect((await request(app).post('/hit')).status).toBe(204)
      }
      expect((await request(app).post('/hit')).status).toBe(429)
    })

    it('blocks any route after 300 requests per window', async () => {
      enable()
      const { globalLimiter } = await load()
      const app = appWith(globalLimiter)

      for (let i = 0; i < 300; i++) {
        expect((await request(app).post('/hit')).status).toBe(204)
      }
      expect((await request(app).post('/hit')).status).toBe(429)
    })

    it('counts each limiter separately — exhausting login does not block uploads', async () => {
      enable()
      const { loginLimiter, uploadLimiter } = await load()
      const loginApp = appWith(loginLimiter)
      const uploadApp = appWith(uploadLimiter)

      for (let i = 0; i < 11; i++) {
        await request(loginApp).post('/hit')
      }
      expect((await request(loginApp).post('/hit')).status).toBe(429)
      expect((await request(uploadApp).post('/hit')).status).toBe(204)
    })

    it('throttles the real /auth/login route', async () => {
      enable()
      vi.resetModules()
      const { app } = await import('../src/app.ts')

      const codes: number[] = []
      for (let i = 0; i < 11; i++) {
        codes.push((await request(app).post('/auth/login').send({})).status)
      }
      // Empty body is a 400 from validation — the limiter runs first and counts it anyway.
      expect(codes.slice(0, 10)).toEqual(Array(10).fill(400))
      expect(codes[10]).toBe(429)
    })
  })
})

describe('security headers', () => {
  it('sets helmet headers and hides x-powered-by', async () => {
    vi.resetModules()
    const { app } = await import('../src/app.ts')

    const res = await request(app).get('/nope')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    // Not asserting the CSP value: Express's own 404 handler overwrites it with default-src 'none'.
    expect(res.headers['content-security-policy']).toBeDefined()
    expect(res.headers['strict-transport-security']).toBeDefined()
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })
})
