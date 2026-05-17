-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM (
  'PENDING_PAYMENT',
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED'
);

-- CreateTable
CREATE TABLE "orders" (
  "id" TEXT NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "checkoutSessionId" TEXT NOT NULL,
  "placeOrderIdempotencyKey" TEXT NOT NULL,
  "paymentProvider" TEXT NOT NULL DEFAULT 'stripe',
  "paymentProviderSessionId" TEXT,
  "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "subtotalCents" INTEGER NOT NULL,
  "shippingCents" INTEGER NOT NULL,
  "taxCents" INTEGER NOT NULL,
  "totalCents" INTEGER NOT NULL,
  "contactEmail" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "shippingMethodName" TEXT NOT NULL DEFAULT 'Standard Shipping',
  "shippingEtaLabel" TEXT NOT NULL DEFAULT '3-5 days',
  "shipToRecipientName" TEXT NOT NULL,
  "shipToCountry" TEXT NOT NULL,
  "shipToCity" TEXT NOT NULL,
  "shipToPostalCode" TEXT NOT NULL,
  "shipToLine1" TEXT NOT NULL,
  "shipToLine2" TEXT,
  "shipToPhone" TEXT,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  "paidAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "shippedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "refundStatusPlaceholder" TEXT,
  "refundReasonPlaceholder" TEXT,
  "refundExternalRefPlaceholder" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_line_items" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT,
  "productSlug" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "productFit" TEXT NOT NULL,
  "productColor" TEXT NOT NULL,
  "productSize" "ProductSize" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPriceCents" INTEGER NOT NULL,
  "lineSubtotalCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "primaryImageUrl" TEXT NOT NULL,
  "secondaryImageUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "order_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");
CREATE UNIQUE INDEX "orders_checkoutSessionId_key" ON "orders"("checkoutSessionId");
CREATE UNIQUE INDEX "orders_user_checkout_idempotency_key" ON "orders"("userId", "checkoutSessionId", "placeOrderIdempotencyKey");
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("userId", "createdAt");
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "createdAt");
CREATE INDEX "order_line_items_order_id_idx" ON "order_line_items"("orderId");
CREATE INDEX "order_line_items_product_id_idx" ON "order_line_items"("productId");

-- AddForeignKey
ALTER TABLE "orders"
ADD CONSTRAINT "orders_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders"
ADD CONSTRAINT "orders_checkoutSessionId_fkey"
FOREIGN KEY ("checkoutSessionId") REFERENCES "checkout_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_line_items"
ADD CONSTRAINT "order_line_items_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_line_items"
ADD CONSTRAINT "order_line_items_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
