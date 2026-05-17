import { Controller, Headers, HttpCode, Inject, Post, Req } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { RawBodyRequest } from '@nestjs/common';
import type { RequestWithContext } from '../common/request-context.js';
import { WebhooksService } from './webhooks.service.js';

@Controller('webhooks')
export class WebhooksController {
  constructor(@Inject(WebhooksService) private readonly webhooksService: WebhooksService) {}

  @Post('stripe')
  @HttpCode(200)
  async handleStripeWebhook(
    @Req() request: RawBodyRequest<RequestWithContext>,
    @Headers('stripe-signature') signatureHeader: string | undefined,
  ) {
    Sentry.setTag('checkout.operation', 'stripe-webhook');
    Sentry.setTag('order.operation', 'payment-reconcile');

    return Sentry.startSpan(
      {
        name: 'checkout.webhook.stripe',
        op: 'http.server',
      },
      async () =>
        this.webhooksService.handleStripeWebhook({
          rawBody: request.rawBody,
          signatureHeader,
          requestId: request.requestId,
        }),
    );
  }
}
