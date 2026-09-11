import { Prisma } from '@prisma/client'

const MAX_ATTEMPTS = 5
const BASE_DELAY_MS = 20

function isSerializationFailure(err: unknown): boolean {
  // Prisma surfaces a Postgres 40001 (serialization_failure) two ways: as P2034
  // for a conflict it detects itself in an interactive transaction, and as P2010
  // ("raw query failed") with the underlying code in `meta.code` for a $queryRaw/
  // $executeRaw statement — which is what our FOR UPDATE lock uses. Retry both;
  // never let either reach the client as a 500.
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) {
    return false
  }
  if (err.code === 'P2034') {
    return true
  }
  return err.code === 'P2010' && (err.meta as { code?: string } | undefined)?.code === '40001'
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
