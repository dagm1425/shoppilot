-- CreateEnum
CREATE TYPE "PaymentWebhookEventStatus" AS ENUM (
  'RECEIVED',
  'PROCESSING',
  'PROCESSED',
  'FAILED',
  'IGNORED'
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'stripe',
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "providerSessionId" TEXT,
  "checkoutSessionId" TEXT,
  "orderId" TEXT,
  "status" "PaymentWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_eventId_key" ON "payment_webhook_events"("eventId");
CREATE INDEX "payment_webhook_events_provider_event_type_idx" ON "payment_webhook_events"("provider", "eventType");
CREATE INDEX "payment_webhook_events_provider_session_id_idx" ON "payment_webhook_events"("providerSessionId");
CREATE INDEX "payment_webhook_events_status_received_at_idx" ON "payment_webhook_events"("status", "receivedAt");
