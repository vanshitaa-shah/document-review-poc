import cookieParser from 'cookie-parser'
import express from 'express'
import { pinoHttp } from 'pino-http'
import { prisma } from './lib/prisma.js'
import { httpLoggerOptions } from './lib/logger.js'
import { serveWebUi } from './lib/staticUi.js'
import { authRouter } from './routes/auth.js'
import { categoriesRouter } from './routes/categories.js'
import { documentsRouter } from './routes/documents.js'
import { reviewsRouter } from './routes/reviews.js'
import { versionsRouter } from './routes/versions.js'
import { errorHandler } from './middleware/errorHandler.js'

export const app = express()

// One log line per request via the child logger pino-http attaches as req.log —
// see lib/logger.ts for the minimal message format.
app.use(pinoHttp(httpLoggerOptions))
app.use(express.json())
app.use(cookieParser())

app.get('/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`
  res.status(200).json({ status: 'ok' })
})

// Must come before the API routers: several client routes (e.g. /documents/:id,
// /reviews/queue) share a path with an API route. This decides by request intent
// (Accept: text/html) rather than path, so it has to see the request first.
serveWebUi(app)

app.use('/auth', authRouter)
app.use('/categories', categoriesRouter)
app.use('/documents', documentsRouter)
app.use('/reviews', reviewsRouter)
app.use('/versions', versionsRouter)

app.use(errorHandler)
