import express from 'express'
import { pinoHttp } from 'pino-http'
import { prisma } from './lib/prisma.js'
import { authRouter } from './routes/auth.js'
import { documentsRouter } from './routes/documents.js'
import { reviewsRouter } from './routes/reviews.js'
import { versionsRouter } from './routes/versions.js'
import { errorHandler } from './middleware/errorHandler.js'

export const app = express()

app.use(pinoHttp())
app.use(express.json())

app.get('/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`
  res.status(200).json({ status: 'ok' })
})

app.use('/auth', authRouter)
app.use('/documents', documentsRouter)
app.use('/reviews', reviewsRouter)
app.use('/versions', versionsRouter)

app.use(errorHandler)
