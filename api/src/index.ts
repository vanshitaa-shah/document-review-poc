import express from 'express'
import { pinoHttp } from 'pino-http'
import { prisma } from './lib/prisma.js'

const app = express()
const port = process.env.PORT ?? 3000

app.use(pinoHttp())
app.use(express.json())

app.get('/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`
  res.status(200).json({ status: 'ok' })
})

app.listen(port, () => {
  console.log(`api listening on port ${port}`)
})
