-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- Data-safe backfill: User may already have rows (production), so roleId is added
-- nullable, filled from the old "role" enum column, and only then made NOT NULL.
INSERT INTO "Role" ("id", "name")
SELECT gen_random_uuid()::text, e.name
FROM unnest(enum_range(NULL::"UserRole")::text[]) AS e(name);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "roleId" TEXT;

UPDATE "User" SET "roleId" = r."id" FROM "Role" r WHERE r."name" = "User"."role"::text;

ALTER TABLE "User" ALTER COLUMN "roleId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
