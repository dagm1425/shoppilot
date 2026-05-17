-- CreateEnum
CREATE TYPE "ProductMediaRole" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateTable
CREATE TABLE "product_media" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "role" "ProductMediaRole" NOT NULL,
  "objectKey" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "altText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "product_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_media_objectKey_key" ON "product_media"("objectKey");
CREATE UNIQUE INDEX "product_media_product_id_role_key" ON "product_media"("productId", "role");
CREATE INDEX "product_media_product_id_idx" ON "product_media"("productId");

-- AddForeignKey
ALTER TABLE "product_media"
ADD CONSTRAINT "product_media_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
