-- Normalize existing product rows so all values fit the reduced enum.
UPDATE "products"
SET "category" = 'TOPS'
WHERE "category" IN ('HOODIES', 'ACCESSORIES');

-- Reduce ProductCategory enum to the minimal set required for Phase 1.
CREATE TYPE "ProductCategory_new" AS ENUM ('LEGGINGS', 'TOPS');

ALTER TABLE "products"
ALTER COLUMN "category" TYPE "ProductCategory_new"
USING ("category"::text::"ProductCategory_new");

DROP TYPE "ProductCategory";

ALTER TYPE "ProductCategory_new" RENAME TO "ProductCategory";
