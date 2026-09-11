# Phase 07 — UI foundation

**Day 9** · Depends on: 06

## Goal
A React app that logs in and lists your documents. Plain, functional, no polish.

## Tasks
- `web/`: Vite + React 19 + TypeScript
- Tailwind CSS
- `react-router` with the handful of routes
- Small typed API client wrapping `fetch` — attaches the JWT, parses errors
- Auth context: token in memory + localStorage, redirect to login on 401
- **Login page** — email, password, error message
- **Document list** — your categories only, paginated, shows title, category, status,
  current version number
- Shared error display that shows the server's message verbatim. A 409 must be
  visible in the UI, not swallowed into a generic "something went wrong".
- Vite build wired into the Docker image; Express serves `dist/` with SPA fallback,
  so it's one container and one origin (no CORS setup)

## Done when
- `docker compose up` serves the UI and the API on the same origin
- Login works, bad credentials show an error
- Document list shows only your categories and pages correctly
- A 401 redirects to login

## Not in this phase
- Document detail, upload, review actions (phase 08)
- Any visual design work
