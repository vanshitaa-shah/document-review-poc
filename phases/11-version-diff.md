# Phase 11 — Version diff view

Added post-plan · Depends on: 09

## Goal
A reviewer or author looking at version history can compare any version's content
against its immediate predecessor and see what changed, instead of re-reading the
whole document to spot edits.

## Tasks

**Diffing library**
- `diff` (jsdiff) on the frontend — `diffWords`/`diffLines`, no backend change needed
  since version content is already fetched via `GET /versions/:id/content`
- No new dependency on the API side; the diff is computed client-side from two already-
  authorized content fetches

**UI**
- On the History tab, each version row (other than v1) gets a "Compare with previous"
  action
- Opens a diff view: fetches content for both the selected version and the one
  immediately before it (`versionNumber - 1`), computes a word-level diff, renders
  added text highlighted green / removed text struck-through red — GitHub-diff style
- `.pdf`/unsupported formats: no diffable text — show "No inline diff available for
  this file type" instead of attempting one
- Reuses existing category-access-checked endpoints; no new authorization surface

## Done when
- From the History tab, comparing v2 against v1 (or any vN against vN-1) shows a
  word-level diff with additions/removals visually distinct
- Comparing an unsupported format (pdf) shows the fallback message, not a crash
- Comparing v1 (no predecessor) does not show the compare action at all

## Not in this phase
- Server-side diff computation or caching
- Line-level or character-level diff modes (word-level only)
- Diffing across non-adjacent versions (only vN vs vN-1)
