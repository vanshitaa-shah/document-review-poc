import { Prisma } from '@prisma/client'

// Tuned for a remote DB (Neon), not just local Postgres: a round trip there
// is ~275-300ms warm (and 2s+ on a cold start) versus <5ms local, so a
// transaction attempt takes much longer in wall-clock time and the same
// logical contention window burns through a small retry budget far faster.
// 8 attempts with this backoff spans ~2.5s of total wait before giving up.
const MAX_ATTEMPTS = 8
const BASE_DELAY_MS = 20

// Postgres 40001 (serialization_failure) reaches this app through several
// different shapes depending on the Prisma engine and exactly when Postgres's
// predicate-lock checker discovers the conflict — mid-statement or at commit.
// Getting this wrong means zero retries ever actually fire, silently, no
// matter how generous MAX_ATTEMPTS is. Known shapes, all handled below:
//
// 1. Classic query engine (pre-driver-adapter), $queryRaw failure:
//    PrismaClientKnownRequestError, code P2010, meta.code === '40001'
// 2. Driver adapter (`@prisma/adapter-pg`, since the Prisma 7 migration),
//    $queryRaw failure:
//    PrismaClientKnownRequestError, code P2010,
//    meta.driverAdapterError.cause.originalCode === '40001'
// 3. Driver adapter, conflict detected at COMMIT of an interactive
//    transaction (not tied to one statement) — thrown directly, not even
//    wrapped in a PrismaClientKnownRequestError:
//    DriverAdapterError, cause.originalCode === '40001'
// 4. Prisma's own interactive-transaction conflict detection:
//    PrismaClientKnownRequestError, code P2034 (no raw-query wrapping at all)
function isSerializationFailure(err: unknown): boolean {
  const cause = (err as { cause?: { originalCode?: string } } | undefined)?.cause
  if (cause?.originalCode === '40001') {
    return true // shape 3
  }
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) {
    return false
  }
  if (err.code === 'P2034') {
    return true // shape 4
  }
  if (err.code !== 'P2010') {
    return false
  }
  const meta = err.meta as
    | { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } }
    | undefined
  return meta?.code === '40001' || meta?.driverAdapterError?.cause?.originalCode === '40001' // shapes 1 & 2
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
