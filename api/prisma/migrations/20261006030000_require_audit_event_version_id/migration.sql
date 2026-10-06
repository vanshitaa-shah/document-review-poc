-- Every audit action (upload, submit, approve, changes requested, superseded)
-- is about a specific version; no code path ever wrote a null versionId.
-- AlterTable
ALTER TABLE "AuditEvent" ALTER COLUMN "versionId" SET NOT NULL;
