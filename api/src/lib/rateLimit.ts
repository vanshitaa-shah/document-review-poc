import { rateLimit } from 'express-rate-limit'

// Request throttling via express-rate-limit, keyed by client IP. A client over a limit gets 429.
// Off under test so the race tests aren't throttled; rate-limit.test.ts opts back in with
// RATE_LIMIT_IN_TEST=true. Read per request so a test can flip it without reloading.
const disabled = () => process.env.NODE_ENV === 'test' && process.env.RATE_LIMIT_IN_TEST !== 'true'

function limiter(windowMs: number, limit: number, message: string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: disabled,
    handler: (_req, res) => {
      res.status(429).json({ error: message })
    },
  })
}

// Global: all routes, 300 requests per minute per IP. Loose — only stops a runaway client.
export const globalLimiter = limiter(60_000, 300, 'Too many requests, slow down')

// Login: POST /auth/login, 10 attempts per minute per IP. Brute-force guard.
export const loginLimiter = limiter(60_000, 10, 'Too many login attempts, try again later')

// Upload: new document and new revision uploads, 20 per minute per IP. Each buffers up to 10MB in memory.
export const uploadLimiter = limiter(60_000, 20, 'Too many uploads, try again shortly')
