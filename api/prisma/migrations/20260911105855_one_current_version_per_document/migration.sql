-- Enforce at most one current version per document. Application code can have
-- bugs; this index cannot be argued with — a violating write fails loudly
-- instead of corrupting state.
CREATE UNIQUE INDEX "one_current_version_per_document"
  ON "DocumentVersion" ("documentId")
  WHERE "isCurrent" = true;
