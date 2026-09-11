# Phase 02 — Upload & submit for review

**Day 3** · Depends on: 01

## Goal
An author can upload a document with metadata and submit it for review.

## Tasks
- `multer` writing to the `./uploads` volume, filename = a generated id, not the
  user's filename
- Accept only `.txt`, `.pdf`, `.md`, `.docx`; reject anything else
- Max 10 MB
- Reject a submission with no file — before it reaches any business logic
- Compute and store sha256 + byte size for each upload
- `POST /documents` — file + title + category. Creates the Document and version 1,
  marked current, status DRAFT
- Author must belong to the category they're uploading into
- `POST /documents/:id/submit` — moves the current version to SUBMITTED
- `GET /documents` — lists documents in your categories
- `GET /documents/:id` — one document with its current version
- Zod validation on every body and param

## Done when
- Upload with a valid file and category succeeds and version 1 is current
- Upload with no file, a bad type, or an oversized file is rejected with 400
- Upload into a category you don't belong to is rejected
- A submitted document appears for reviewers in that category; a DRAFT one does not
- An already-submitted document can't be submitted twice

## Not in this phase
- Revisions and supersession (phase 03)
- Reviewing (phase 04)
