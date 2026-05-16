-- Add cart item size support for PDP-required size selection.
CREATE TYPE "ProductSize" AS ENUM ('S', 'M', 'L', 'XL');

ALTER TABLE "cart_items"
ADD COLUMN "size" "ProductSize" NOT NULL DEFAULT 'M';

DROP INDEX "cart_items_cart_id_product_id_key";

CREATE UNIQUE INDEX "cart_items_cart_id_product_id_size_key"
ON "cart_items"("cartId", "productId", "size");
