-- Create checkout foundation tables for Phase 2 Subphase 2.1.
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "phone" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "checkout_sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "selectedAddressId" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "blockingReasons" JSONB NOT NULL,
    "cartSnapshot" JSONB NOT NULL,
    "priceValidatedAt" TIMESTAMP(3) NOT NULL,
    "pricingSnapshotId" TEXT,
    "paymentProviderSessionId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkout_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "checkout_sessions_token_key" ON "checkout_sessions"("token");
CREATE INDEX "addresses_user_id_idx" ON "addresses"("userId");
CREATE INDEX "addresses_user_id_is_default_idx" ON "addresses"("userId", "isDefault");
CREATE INDEX "checkout_sessions_user_id_cart_id_is_active_idx" ON "checkout_sessions"("userId", "cartId", "isActive");
CREATE INDEX "checkout_sessions_expires_at_idx" ON "checkout_sessions"("expiresAt");
CREATE INDEX "checkout_sessions_selected_address_id_idx" ON "checkout_sessions"("selectedAddressId");

ALTER TABLE "addresses"
ADD CONSTRAINT "addresses_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "checkout_sessions"
ADD CONSTRAINT "checkout_sessions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "checkout_sessions"
ADD CONSTRAINT "checkout_sessions_cartId_fkey"
FOREIGN KEY ("cartId") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "checkout_sessions"
ADD CONSTRAINT "checkout_sessions_selectedAddressId_fkey"
FOREIGN KEY ("selectedAddressId") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
