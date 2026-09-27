import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false,
    // Uploads now go to real Cloudinary (see lib/storage.ts) instead of local
    // disk, so every test that uploads a file makes a real network call —
    // the default 5s budget is too tight for that, especially with several
    // uploads in one test.
    testTimeout: 30000,
    // A cold connection to the remote Postgres (Neon) can itself take ~10s,
    // before any of a beforeAll/afterAll's several setup/teardown queries even
    // run — the default 10s hook budget is tuned for local Postgres, not this.
    hookTimeout: 30000,
  },
})
