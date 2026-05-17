import { Injectable } from '@nestjs/common';
import { parseEnv } from '../config/env.js';
import Stripe from 'stripe';

type CreateHostedSessionInput = {
  sessionToken: string;
  userId: string;
  customerEmail: string | null;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
};

@Injectable()
export class StripeCheckoutProvider {
  private readonly env = parseEnv(process.env);
  private readonly stripe = new Stripe(this.env.STRIPE_SECRET_KEY);

  async createHostedSession(input: CreateHostedSessionInput) {
    return this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        customer_email: input.customerEmail ?? undefined,
        metadata: {
          checkoutSessionToken: input.sessionToken,
          userId: input.userId,
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Order subtotal',
              },
              unit_amount: input.subtotalCents,
            },
          },
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Standard shipping',
              },
              unit_amount: input.shippingCents,
            },
          },
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Estimated tax',
              },
              unit_amount: input.taxCents,
            },
          },
        ],
      },
      {
        idempotencyKey: input.idempotencyKey,
      },
    );
  }

  async retrieveSession(sessionId: string) {
    return this.stripe.checkout.sessions.retrieve(sessionId);
  }

  constructWebhookEvent(
    rawBody: Buffer | string,
    signatureHeader: string,
    webhookSecret: string,
  ): Stripe.Event {
    return this.stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
  }
}
