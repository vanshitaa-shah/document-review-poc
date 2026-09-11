# Phase 08 — UI document workflow

**Day 10** · Depends on: 07

## Goal
The whole workflow is clickable end to end.

## Tasks

**Document detail page**
- Title, category, current version, status
- Version history table: version number, uploaded by, when, status
- Audit trail, or at least the key events, visible on the page

**Author actions**
- Upload a new document (file + title + category)
- Upload a revision
- Submit for review
- Client-side file type and size hints — but the server stays the real validator

**Reviewer actions**
- Review queue page
- Approve
- Request changes, with a comment box that the server requires

**Approved state**
- Download button
- Approval record shown on the page: who approved, when, which version

**Error surfacing**
- The stale-approval `409` renders clearly, naming the current version. This is the
  case demoed in the walkthrough, so it has to be legible, not a red toast.

## Done when
- An author can go upload → submit → revise entirely through the UI
- A reviewer can approve or request changes through the UI
- Two browser windows: reviewer opens a version, author uploads a revision,
  reviewer clicks approve → the 409 is visible on screen
- Approved documents show the download and the approval record

## Not in this phase
- Inline text commenting (phase 09)
- Responsive layout, dark mode, loading skeletons
