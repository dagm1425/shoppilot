import { HttpException } from '@nestjs/common';
import { PaymentWebhookEventStatus } from '@prisma/client';
import type { CheckoutService } from '../../src/checkout/checkout.service.js';
import type { StripeCheckoutProvider } from '../../src/checkout/stripe-checkout.provider.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { WebhooksService } from '../../src/webhooks/webhooks.service.js';

type MockWebhookRecord = {
  eventId: string;
  status: PaymentWebhookEventStatus;
};

function buildService() {
  const prisma = {
    paymentWebhookEvent: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as PrismaService;

  const checkoutService = {
    reconcilePaymentByProviderSessionId: jest.fn(),
  } as unknown as CheckoutService;

  const stripeCheckoutProvider = {
    constructWebhookEvent: jest.fn(),
  } as unknown as StripeCheckoutProvider;

  const service = new WebhooksService(prisma, checkoutService, stripeCheckoutProvider);

  return {
    service,
    prisma: prisma as unknown as {
      paymentWebhookEvent: {
        upsert: jest.Mock;
        updateMany: jest.Mock;
        findUnique: jest.Mock;
        update: jest.Mock;
      };
    },
    checkoutService: checkoutService as unknown as {
      reconcilePaymentByProviderSessionId: jest.Mock;
    },
    stripeCheckoutProvider: stripeCheckoutProvider as unknown as {
      constructWebhookEvent: jest.Mock;
    },
  };
}

function buildCheckoutSessionEvent(input: {
  eventId: string;
  eventType: string;
  sessionId: string;
}) {
  return {
    id: input.eventId,
    type: input.eventType,
    data: {
      object: {
        object: 'checkout.session',
        id: input.sessionId,
      },
    },
  };
}

async function captureHttpException(promise: Promise<unknown>): Promise<HttpException> {
  try {
    await promise;
    throw new Error('Expected HttpException to be thrown');
  } catch (error) {
    if (!(error instanceof HttpException)) {
      throw error;
    }

    return error;
  }
}

describe('webhooks service', () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_unit_test';
  });

  it('rejects missing signature header before parsing event', async () => {
    const { service } = buildService();

    const exception = await captureHttpException(
      service.handleStripeWebhook({
        rawBody: Buffer.from('{}'),
        signatureHeader: undefined,
      }),
    );

    expect(exception.getStatus()).toBe(400);
    expect(exception.getResponse()).toMatchObject({
      code: 'WEBHOOK_SIGNATURE_MISSING',
    });
  });

  it('returns duplicate no-op result when event is already processed', async () => {
    const { service, prisma, stripeCheckoutProvider, checkoutService } = buildService();
    const event = buildCheckoutSessionEvent({
      eventId: 'evt_duplicate_1',
      eventType: 'checkout.session.completed',
      sessionId: 'cs_duplicate_1',
    });

    stripeCheckoutProvider.constructWebhookEvent.mockReturnValue(event);
    prisma.paymentWebhookEvent.upsert.mockResolvedValue({
      eventId: event.id,
      status: PaymentWebhookEventStatus.PROCESSED,
    } satisfies MockWebhookRecord);
    prisma.paymentWebhookEvent.updateMany.mockResolvedValue({ count: 0 });
    prisma.paymentWebhookEvent.findUnique.mockResolvedValue({
      eventId: event.id,
      status: PaymentWebhookEventStatus.PROCESSED,
    } satisfies MockWebhookRecord);

    const response = await service.handleStripeWebhook({
      rawBody: Buffer.from(JSON.stringify(event)),
      signatureHeader: 'sig_ok',
    });

    expect(response).toEqual({
      received: true,
      processed: true,
      duplicate: true,
    });
    expect(checkoutService.reconcilePaymentByProviderSessionId).not.toHaveBeenCalled();
  });

  it('marks event failed and returns retryable failure when checkout session link is missing', async () => {
    const { service, prisma, stripeCheckoutProvider, checkoutService } = buildService();
    const event = buildCheckoutSessionEvent({
      eventId: 'evt_missing_session_1',
      eventType: 'checkout.session.completed',
      sessionId: 'cs_missing_session_1',
    });

    stripeCheckoutProvider.constructWebhookEvent.mockReturnValue(event);
    prisma.paymentWebhookEvent.upsert.mockResolvedValue({
      eventId: event.id,
      status: PaymentWebhookEventStatus.RECEIVED,
    } satisfies MockWebhookRecord);
    prisma.paymentWebhookEvent.updateMany.mockResolvedValue({ count: 1 });
    checkoutService.reconcilePaymentByProviderSessionId.mockResolvedValue({
      providerSessionId: 'cs_missing_session_1',
      checkoutSessionId: null,
      checkoutSessionToken: null,
      paymentStatus: 'pending',
      outcome: 'missing_session',
      orderId: null,
      orderNumber: null,
    });
    prisma.paymentWebhookEvent.update.mockResolvedValue({
      eventId: event.id,
      status: PaymentWebhookEventStatus.FAILED,
    } satisfies MockWebhookRecord);

    const exception = await captureHttpException(
      service.handleStripeWebhook({
        rawBody: Buffer.from(JSON.stringify(event)),
        signatureHeader: 'sig_ok',
      }),
    );

    expect(exception.getStatus()).toBe(500);
    expect(exception.getResponse()).toMatchObject({
      code: 'WEBHOOK_PROCESSING_FAILED',
    });

    expect(prisma.paymentWebhookEvent.update).toHaveBeenCalled();
  });
});
