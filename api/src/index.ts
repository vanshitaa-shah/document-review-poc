import 'dotenv/config'
import { app } from './app.js'
import { logger } from './lib/logger.js'
import { prisma } from './lib/prisma.js'

const port = process.env.PORT ?? 3000

const server = app.listen(port, () => {
  logger.info(`api listening on port ${port}`)
})

// logger's transport targets (pino-pretty / pino-opentelemetry-transport) run on
// worker threads, so a write is not on disk/stdout the instant logger.info() returns.
// Flushing before process.exit() avoids losing the last log line on shutdown.
function flushLogger() {
  return new Promise<void>((resolve) => logger.flush(() => resolve()))
}

async function exit(code: number) {
  await flushLogger()
  process.exit(code)
}

// Stop accepting new connections, let in-flight requests finish, then release
// the Prisma pool — otherwise a mid-approval transaction gets cut off by a
// cold container restart instead of completing or rolling back cleanly.
async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`)
  server.close(async (err) => {
    if (err) logger.error(err, 'error while closing http server')
    await prisma.$disconnect()
    await exit(err ? 1 : 0)
  })
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

process.on('uncaughtException', (err) => {
  logger.fatal(err, 'uncaught exception')
  void exit(1)
})

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'unhandled rejection')
  void exit(1)
})
