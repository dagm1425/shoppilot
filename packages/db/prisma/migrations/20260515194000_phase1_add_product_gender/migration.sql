-- Add product gender enum and column.
CREATE TYPE "ProductGender" AS ENUM ('MEN', 'WOMEN');

ALTER TABLE "products"
ADD COLUMN "gender" "ProductGender" NOT NULL DEFAULT 'MEN';

-- Backfill a reasonable split for existing seeded rows.
UPDATE "products"
SET "gender" = 'WOMEN'
WHERE "slug" IN (
  'vital-seamless-legging',
  'essential-cropped-tee',
  'flow-sports-bra'
);

CREATE INDEX "products_gender_category_created_at_idx"
ON "products"("gender", "category", "createdAt");
