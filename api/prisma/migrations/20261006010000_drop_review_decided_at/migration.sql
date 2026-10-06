-- Write-only column: set on every Review.create but never read by any
-- controller or the frontend. Dropped rather than left as dead data.
-- AlterTable
ALTER TABLE "Review" DROP COLUMN "decidedAt";
