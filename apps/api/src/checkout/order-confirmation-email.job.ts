import { z } from 'zod';

export const ORDER_CONFIRMATION_EMAIL_QUEUE = 'order-confirmation-email';
export const SEND_ORDER_CONFIRMATION_JOB = 'send-order-confirmation';

const ORDER_CONFIRMATION_JOB_ID_PREFIX = 'order-confirmation';

export const orderConfirmationEmailJobPayloadSchema = z.object({
  orderId: z.string().trim().min(1),
  orderNumber: z.string().trim().min(1),
  recipientEmail: z.string().trim().email(),
  totalCents: z.number().int().nonnegative(),
  currency: z.string().trim().min(1),
  paidAtIso: z.string().datetime(),
  requestId: z.string().trim().min(1).optional(),
  source: z.enum(['webhook', 'return-flow']).optional(),
});

export type OrderConfirmationEmailJobPayload = z.infer<
  typeof orderConfirmationEmailJobPayloadSchema
>;

export function parseOrderConfirmationEmailJobPayload(
  input: unknown,
): OrderConfirmationEmailJobPayload {
  return orderConfirmationEmailJobPayloadSchema.parse(input);
}

export function buildOrderConfirmationJobId(orderId: string): string {
  return `${ORDER_CONFIRMATION_JOB_ID_PREFIX}-${orderId.trim()}`;
}
