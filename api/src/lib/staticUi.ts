import { existsSync } from 'node:fs'
import path from 'node:path'
import express, { type Express } from 'express'

// Serves the built web/ SPA from `public/` — the Docker image's web build stage
// copies Vite's dist/ there — so the UI and API share one origin, no CORS needed.
// A no-op when `public/` is absent (local API-only dev, tests), so nothing here
// requires the UI to have been built.
//
// Client routes and API routes share paths on purpose (/documents/:id is both
// a page and an endpoint), so this can't be a catch-all mounted after the API
// routers — that would never be reached for any path an API router also owns.
// Instead it runs first and decides by intent: a real browser navigation sends
// `Accept: text/html`; this app's own fetch() calls never do. Anything else
// (assets, actual API calls) falls through via next().
export function serveWebUi(app: Express) {
  const publicDir = path.join(process.cwd(), 'public')
  const indexPath = path.join(publicDir, 'index.html')
  if (!existsSync(publicDir)) {
    return
  }

  app.use(express.static(publicDir))

  app.use((req, res, next) => {
    if (req.method === 'GET' && req.headers.accept?.includes('text/html')) {
      res.sendFile(indexPath)
      return
    }
    next()
  })
}
