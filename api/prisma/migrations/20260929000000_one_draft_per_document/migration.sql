-- A revision is now uploaded as a pending draft (isCurrent = false) while the
-- reviewed version stays current. At most one draft may exist per document, so a
-- second concurrent upload cannot leave two drafts behind. The swap that makes
-- the draft current happens at submit.
CREATE UNIQUE INDEX "one_draft_per_document"
  ON "DocumentVersion" ("documentId")
  WHERE "status" = 'DRAFT';
