import { existsSync } from 'node:fs'
import path from 'node:path'
import express, { type Express } from 'express'

// Serves the built web/ SPA from `public/` — the Docker image's web build stage
// copies Vite's dist/ there — so the UI and API share one origin, no CORS needed.
// A no-op when `public/` is absent (local API-only dev, tests), so nothing here
// requires the UI to have been built.
export function serveWebUi(app: Express) {
  const publicDir = path.join(process.cwd(), 'public')
  if (!existsSync(publicDir)) {
    return
  }

  app.use(express.static(publicDir))
  // Anything not matched by an API route or a static asset is a client-side
  // route (e.g. /documents, /login) — hand it index.html and let react-router decide.
  // Express 5's path-to-regexp requires a named wildcard, not a bare '*'.
  app.get('/*splat', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'))
  })
}
