import { Readable } from 'node:stream'
import 'dotenv/config'
import { vi } from 'vitest'

// Running via `docker compose exec api npm test` gets DATABASE_URL etc. from
// docker-compose.yml's environment block already. Running `npm test` directly
// on the host doesn't — nothing else loads api/.env for a plain vitest run
// (prisma.config.ts's own dotenv import only fires for the Prisma CLI), so
// without this, DATABASE_URL is undefined and every single test fails the
// same way, with no clue why.
process.env.JWT_SECRET ??= 'test-secret'

// Cloudinary is an external dependency, not something this POC is graded on
// (see CLAUDE.md — versioning/approval correctness is). Tests exercise this
// app's own upload/submit/approve/download logic against a real Postgres,
// but the object store behind putObject/getObjectBuffer/getObjectStream is
// swapped for an in-memory fake so the suite never depends on Cloudinary
// being reachable or configured a particular way.
const store = new Map<string, Buffer>()

vi.mock('../src/lib/storage.js', () => ({
  putObject: async (key: string, body: Buffer): Promise<void> => {
    store.set(key, body)
  },
  getObjectBuffer: async (key: string): Promise<Buffer> => {
    const body = store.get(key)
    if (!body) throw new Error(`no object stored for key ${key}`)
    return body
  },
  getObjectStream: async (key: string): Promise<Readable> => {
    const body = store.get(key)
    if (!body) throw new Error(`no object stored for key ${key}`)
    return Readable.from(body)
  },
}))
