-- Review rows are only ever created already-decided (status: CHANGES_REQUESTED).
-- PENDING/APPROVED/SUPERSEDED were never written by any code path — dropped.
-- AlterEnum
BEGIN;
CREATE TYPE "ReviewStatus_new" AS ENUM ('CHANGES_REQUESTED');
ALTER TABLE "public"."Review" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Review" ALTER COLUMN "status" TYPE "ReviewStatus_new" USING ("status"::text::"ReviewStatus_new");
ALTER TYPE "ReviewStatus" RENAME TO "ReviewStatus_old";
ALTER TYPE "ReviewStatus_new" RENAME TO "ReviewStatus";
DROP TYPE "public"."ReviewStatus_old";
ALTER TABLE "Review" ALTER COLUMN "status" SET DEFAULT 'CHANGES_REQUESTED';
COMMIT;
