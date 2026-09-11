import { Prisma } from '@prisma/client'

const MAX_ATTEMPTS = 5
const BASE_DELAY_MS = 20

function isSerializationFailure(err: unknown): boolean {
  // Prisma surfaces a Postgres 40001 (serialization_failure) inside an
  // interactive transaction as P2034 — retry it, never let it reach the client as a 500.
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withSerializableRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (!isSerializationFailure(err) || attempt === MAX_ATTEMPTS) {
        throw err
      }
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1))
    }
  }
  throw new Error('unreachable')
}
