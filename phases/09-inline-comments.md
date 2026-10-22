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
- `.html` — served as-is (already the target format), sanitized server-side
- Every comment is anchored to rendered text; there is no version-level
  (generic) comment.
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
- Reading is limited the same way as the document itself: an author sees only their own
  documents, so another author in the same category gets `404` on a version's content,
  comments and download (`isHiddenFromUser`, which takes the caller's role)

**Author replies**
- The document's author and any reviewer with category access can reply, and only to an
  existing comment. Anyone else — another author in the same category, or a reviewer
  outside it — gets `404`, since the document isn't accessible to them
- A reply is a `comments` row with a `parent_id`; it copies its parent's anchor, so
  anchors stay required. Replying to a reply attaches to the root comment — threads are
  one level deep
- A reply is discussion only: it never changes version status and writes no `Review`
  row, so it cannot race with approve, request-changes or supersession
- The `COMMENT_REPLIED` audit row is written in the same transaction as the reply
- Replies are allowed on any version status, including APPROVED and superseded
- UI: clicking a highlight shows each comment with its replies and a "Reply" link for the
  author and reviewers (several reviewers can share one highlighted range); clicking
  outside the popup closes it

**Endpoints**
- `POST /versions/:id/comments` — body + anchor (anchor is required, not optional)
- `POST /versions/:id/comments/:commentId/replies` — body only; document author or a
  reviewer with category access, `404` for everyone else
- `GET /versions/:id/comments` — all comments for that version, replies included (each
  carries `parentId`)
- Category access enforced on both, plus the author-only visibility rule above
- Reject comments on an APPROVED version (it's locked) or a SUPERSEDED one
  (it's no longer the version being reviewed) — existing comments on a
  superseded version stay visible in history, only new ones are blocked

## Done when
- Selecting text on a txt, md or docx document and commenting works
- Reloading the page redraws the highlights in the right places
- Author and reviewer both see the same highlights
- Uploading a new version leaves it with no comments, and the old version keeps its own
- Commenting on an approved version returns 409
- Another author in the same category gets 404 on a version's content, comments and download
- The author and reviewers reply to each comment separately, and the version status does
  not change; another author or an outside reviewer gets 404

## If time runs short
Narrow to `.txt` and `.md` only, and drop the docx conversion. Do not take the time
out of phase 05.

## Not in this phase
- Re-anchoring comments onto a new version
- Mentions, resolve/unresolve, deeper threads
