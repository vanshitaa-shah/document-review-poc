-- DropIndex
DROP INDEX "Document_categoryId_createdAt_idx";

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Document_categoryId_updatedAt_idx" ON "Document"("categoryId", "updatedAt");
