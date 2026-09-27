import cookieParser from 'cookie-parser'
import express from 'express'
import { pinoHttp } from 'pino-http'
import { prisma } from './lib/prisma.ts'
import { httpLoggerOptions } from './lib/logger.ts'
import { serveWebUi } from './lib/staticUi.ts'
import { authRouter } from './routes/auth.ts'
import { categoriesRouter } from './routes/categories.ts'
import { documentsRouter } from './routes/documents.ts'
import { reviewsRouter } from './routes/reviews.ts'
import { versionsRouter } from './routes/versions.ts'
import { errorHandler } from './middleware/errorHandler.ts'

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
