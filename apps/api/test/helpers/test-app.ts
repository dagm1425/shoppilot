import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { AppModule } from '../../src/app.module.js';
import cookieParser from 'cookie-parser';
import { PasswordResetMailerService } from '../../src/auth/password-reset-mailer.service.js';
import { ApiErrorFilter } from '../../src/common/api-error.filter.js';
import { requestContextMiddleware } from '../../src/common/request-context.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { OrderConfirmationEmailQueueService } from '../../src/checkout/order-confirmation-email.queue.service.js';
import { StripeCheckoutProvider } from '../../src/checkout/stripe-checkout.provider.js';
import { ProductMediaStorageService } from '../../src/products/product-media-storage.service.js';
import { ORDER_CONFIRMATION_EMAIL_QUEUE } from '../../src/checkout/order-confirmation-email.job.js';

export async function createTestApp(options?: {
  prismaService?: Partial<PrismaService>;
  orderConfirmationEmailQueueService?: Partial<OrderConfirmationEmailQueueService>;
  passwordResetMailerService?: Partial<PasswordResetMailerService>;
  stripeCheckoutProvider?: Partial<StripeCheckoutProvider>;
  productMediaStorageService?: Partial<ProductMediaStorageService>;
}): Promise<INestApplication> {
  const defaultOrderConfirmationQueue = {
    add: async () => ({}),
    getWaitingCount: async () => 0,
    getActiveCount: async () => 0,
    getCompletedCount: async () => 0,
    getFailedCount: async () => 0,
  };

  const defaultOrderConfirmationEmailQueueService: Partial<OrderConfirmationEmailQueueService> = {
    enqueueOrderConfirmationEmail: async () => {},
    getQueueHealthSnapshot: async () => ({
      queueName: ORDER_CONFIRMATION_EMAIL_QUEUE,
      generatedAt: new Date().toISOString(),
      counts: {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
      },
    }),
  };

  const builder = Test.createTestingModule({
    imports: [AppModule],
  });

  builder
    .overrideProvider(getQueueToken(ORDER_CONFIRMATION_EMAIL_QUEUE))
    .useValue(defaultOrderConfirmationQueue);

  if (options?.prismaService) {
    builder.overrideProvider(PrismaService).useValue(options.prismaService);
  }

  if (options?.passwordResetMailerService) {
    builder
      .overrideProvider(PasswordResetMailerService)
      .useValue(options.passwordResetMailerService);
  }

  builder
    .overrideProvider(OrderConfirmationEmailQueueService)
    .useValue({
      ...defaultOrderConfirmationEmailQueueService,
      ...options?.orderConfirmationEmailQueueService,
    });

  if (options?.stripeCheckoutProvider) {
    builder
      .overrideProvider(StripeCheckoutProvider)
      .useValue(options.stripeCheckoutProvider);
  }

  if (options?.productMediaStorageService) {
    builder
      .overrideProvider(ProductMediaStorageService)
      .useValue(options.productMediaStorageService);
  }

  const testingModule = await builder.compile();

  const app = testingModule.createNestApplication({
    rawBody: true,
  });
  app.use(cookieParser());
  app.use(requestContextMiddleware);
  app.useGlobalFilters(new ApiErrorFilter());
  await app.init();

  return app;
}
