-- CreateEnum
CREATE TYPE "ProductThermalProfile" AS ENUM ('HOT_WEATHER', 'COLD_WEATHER', 'ALL_SEASON');

-- AlterTable
ALTER TABLE "products"
ADD COLUMN "thermalProfile" "ProductThermalProfile" NOT NULL DEFAULT 'ALL_SEASON';

-- CreateIndex
CREATE INDEX "products_thermal_category_created_at_idx"
ON "products"("thermalProfile", "category", "createdAt");
