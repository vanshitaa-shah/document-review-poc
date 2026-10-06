-- Review.comment and Comment.anchorQuote/anchorStart/anchorEnd were already
-- required by the Zod schemas; the database now enforces it too.
-- AlterTable
ALTER TABLE "Review" ALTER COLUMN "comment" SET NOT NULL;

-- AlterTable
ALTER TABLE "Comment" ALTER COLUMN "anchorQuote" SET NOT NULL,
ALTER COLUMN "anchorStart" SET NOT NULL,
ALTER COLUMN "anchorEnd" SET NOT NULL;
