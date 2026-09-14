# Phase 09 — Inline comments

**Day 11** · Depends on: 08

## Goal
A reviewer selects a word or passage and comments on it. Both author and reviewer see
the highlight against that exact text. Medium-style.

## Tasks

**Render the document as text**
- `.txt` — render as-is in a `<pre>`
- `.md` — `react-markdown`
- `.docx` — `mammoth` converts to HTML (server-side, cached per version)
- `.pdf` — no highlighting, and no commenting. Every comment is anchored to
  rendered text; there is no version-level (generic) comment.
- `GET /versions/:id/content` — returns the renderable text/HTML for a version

**Annotation layer**
- `@recogito/react-text-annotator` — handles the selection, the popup, and drawing
  highlights over the rendered content
- On text selection, show a comment box; on save, POST the annotation

**Anchoring — the part that has to be right**
- Store per comment: the exact quoted text, a prefix and suffix of surrounding text,
  and the character start/end offsets
- Quote + prefix/suffix is what makes the anchor survive; offsets make lookup fast.
  Storing offsets alone is brittle.
- Anchors belong to **one specific version id**, never to the document

**Version behaviour**
- Comments do **not** carry over to a new version. Version 2 starts clean.
- Version 1's comments stay visible when viewing version 1 in history.
- Worth being ready to defend in the walkthrough: the author reads the feedback on
  the old version, then uploads the fix. Nothing is lost, it just doesn't follow
  the text forward.

**Who can comment**
- Any reviewer with category access to the document, not just whoever requested
  changes — access is the same `documentVersionCategoryFilter` predicate as everything
  else, no separate "assigned reviewer" concept
- Any number of reviewers can highlight and comment on the same version, as long as
  it isn't APPROVED yet

**Endpoints**
- `POST /versions/:id/comments` — body + anchor (anchor is required, not optional)
- `GET /versions/:id/comments` — all comments for that version
- Category access enforced on both
- Reject comments on an APPROVED version (it's locked)

## Done when
- Selecting text on a txt, md or docx document and commenting works
- Reloading the page redraws the highlights in the right places
- Author and reviewer both see the same highlights
- Uploading a new version leaves it with no comments, and the old version keeps its own
- Commenting on an approved version returns 409

## If time runs short
Narrow to `.txt` and `.md` only, and drop the docx conversion. Do not take the time
out of phase 05.

## Not in this phase
- PDF highlighting
- Re-anchoring comments onto a new version
- Replies, threads, mentions, resolve/unresolve
