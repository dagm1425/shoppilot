import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { PaymentWebhookEventStatus } from '@prisma/client';
import { CheckoutService } from '../checkout/checkout.service.js';
import { StripeCheckoutProvider } from '../checkout/stripe-checkout.provider.js';
import { parseEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type Stripe from 'stripe';

type HandleStripeWebhookInput = {
  rawBody: Buffer | undefined;
  signatureHeader: string | undefined;
  requestId?: string;
};

const SUPPORTED_STRIPE_EVENTS = new Set<string>([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
]);

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly env = parseEnv(process.env);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CheckoutService) private readonly checkoutService: CheckoutService,
    @Inject(StripeCheckoutProvider) private readonly stripeCheckoutProvider: StripeCheckoutProvider,
  ) {}

  async handleStripeWebhook(input: HandleStripeWebhookInput): Promise<{
    received: true;
    processed: boolean;
    duplicate: boolean;
  }> {
    if (!this.env.STRIPE_WEBHOOK_SECRET || this.env.STRIPE_WEBHOOK_SECRET.trim().length === 0) {
      throw new HttpException(
        {
          code: 'WEBHOOK_STRIPE_NOT_CONFIGURED',
          message: 'Stripe webhook secret is not configured.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (!input.signatureHeader || input.signatureHeader.trim().length === 0 || !input.rawBody) {
      throw new HttpException(
        {
          code: 'WEBHOOK_SIGNATURE_MISSING',
          message: 'Missing webhook signature.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    let event: Stripe.Event;

    try {
      event = this.stripeCheckoutProvider.constructWebhookEvent(
        input.rawBody,
        input.signatureHeader,
        this.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      this.logger.warn({
        event: 'stripe.webhook.verify',
        requestId: input.requestId ?? 'unknown-request-id',
        outcome: 'invalid-signature',
      });

      throw new HttpException(
        {
          code: 'WEBHOOK_SIGNATURE_INVALID',
          message: 'Webhook signature validation failed.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const checkoutSession = this.extractCheckoutSessionObject(event);
    const providerSessionId = checkoutSession?.id ?? null;

    await this.prisma.paymentWebhookEvent.upsert({
      where: {
        eventId: event.id,
      },
      create: {
        provider: 'stripe',
        eventId: event.id,
        eventType: event.type,
        providerSessionId,
        status: PaymentWebhookEventStatus.RECEIVED,
      },
      update: {
        eventType: event.type,
        providerSessionId,
      },
    });

    const claimed = await this.prisma.paymentWebhookEvent.updateMany({
      where: {
        eventId: event.id,
        status: {
          in: [PaymentWebhookEventStatus.RECEIVED, PaymentWebhookEventStatus.FAILED],
        },
      },
      data: {
        status: PaymentWebhookEventStatus.PROCESSING,
        lastError: null,
      },
    });

    if (claimed.count === 0) {
      const existing = await this.prisma.paymentWebhookEvent.findUnique({
        where: { eventId: event.id },
      });

      this.logger.log({
        event: 'stripe.webhook.receive',
        requestId: input.requestId ?? 'unknown-request-id',
        stripeEventId: event.id,
        stripeEventType: event.type,
        providerSessionId,
        outcome: 'duplicate',
        storedStatus: existing?.status ?? 'unknown',
      });

      return {
        received: true,
        processed: existing?.status === PaymentWebhookEventStatus.PROCESSED,
        duplicate: true,
      };
    }

    if (!SUPPORTED_STRIPE_EVENTS.has(event.type)) {
      await this.prisma.paymentWebhookEvent.update({
        where: {
          eventId: event.id,
        },
        data: {
          status: PaymentWebhookEventStatus.IGNORED,
          processedAt: new Date(),
        },
      });

      this.logger.log({
        event: 'stripe.webhook.receive',
        requestId: input.requestId ?? 'unknown-request-id',
        stripeEventId: event.id,
        stripeEventType: event.type,
        providerSessionId,
        outcome: 'ignored',
      });

      return {
        received: true,
        processed: false,
        duplicate: false,
      };
    }

    if (!providerSessionId) {
      await this.prisma.paymentWebhookEvent.update({
        where: {
          eventId: event.id,
        },
        data: {
          status: PaymentWebhookEventStatus.IGNORED,
          processedAt: new Date(),
          lastError: 'Missing checkout session identifier in event payload.',
        },
      });

      this.logger.warn({
        event: 'stripe.webhook.process',
        requestId: input.requestId ?? 'unknown-request-id',
        stripeEventId: event.id,
        stripeEventType: event.type,
        outcome: 'ignored-missing-provider-session-id',
      });

      return {
        received: true,
        processed: false,
        duplicate: false,
      };
    }

    try {
      const reconciliation = await this.checkoutService.reconcilePaymentByProviderSessionId(
        providerSessionId,
        'webhook',
        input.requestId,
      );

      if (reconciliation.outcome === 'missing_session') {
        await this.prisma.paymentWebhookEvent.update({
          where: {
            eventId: event.id,
          },
          data: {
            status: PaymentWebhookEventStatus.FAILED,
            lastError: 'Checkout session not found for provider session; awaiting retry.',
          },
        });

        throw new HttpException(
          {
            code: 'WEBHOOK_RECONCILIATION_SESSION_MISSING',
            message: 'Checkout session link not ready yet. Retry webhook delivery.',
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      await this.prisma.paymentWebhookEvent.update({
        where: {
          eventId: event.id,
        },
        data: {
          status: PaymentWebhookEventStatus.PROCESSED,
          processedAt: new Date(),
          checkoutSessionId: reconciliation.checkoutSessionId,
          orderId: reconciliation.orderId,
        },
      });

      this.logger.log({
        event: 'stripe.webhook.process',
        requestId: input.requestId ?? 'unknown-request-id',
        stripeEventId: event.id,
        stripeEventType: event.type,
        providerSessionId,
        checkoutSessionId: reconciliation.checkoutSessionId,
        orderId: reconciliation.orderId,
        orderNumber: reconciliation.orderNumber,
        paymentStatus: reconciliation.paymentStatus,
        reconciliationOutcome: reconciliation.outcome,
        outcome: 'processed',
      });

      return {
        received: true,
        processed: true,
        duplicate: false,
      };
    } catch (error) {
      await this.prisma.paymentWebhookEvent.update({
        where: {
          eventId: event.id,
        },
        data: {
          status: PaymentWebhookEventStatus.FAILED,
          lastError: error instanceof Error ? error.message : 'Unknown webhook processing failure.',
        },
      });

      // future: webhook replay tooling - scheduled for Phase 3 operability scope
      throw new HttpException(
        {
          code: 'WEBHOOK_PROCESSING_FAILED',
          message: 'Stripe webhook processing failed and can be retried safely.',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private extractCheckoutSessionObject(event: Stripe.Event): Stripe.Checkout.Session | null {
    if (!event.type.startsWith('checkout.session.')) {
      return null;
    }

    const candidate = event.data.object as unknown as Record<string, unknown>;

    if (candidate.object !== 'checkout.session' || typeof candidate.id !== 'string') {
      return null;
    }

    return candidate as unknown as Stripe.Checkout.Session;
  }
}
