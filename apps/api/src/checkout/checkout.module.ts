import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import type { RedisOptions } from 'ioredis';
import { parseEnv } from '../config/env.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CheckoutController } from './checkout.controller.js';
import { ORDER_CONFIRMATION_EMAIL_QUEUE } from './order-confirmation-email.job.js';
import { OrderConfirmationEmailMailerService } from './order-confirmation-email.mailer.service.js';
import { OrderConfirmationEmailProcessor } from './order-confirmation-email.processor.js';
import { OrderConfirmationEmailQueueService } from './order-confirmation-email.queue.service.js';
import { CheckoutService } from './checkout.service.js';
import { StripeCheckoutProvider } from './stripe-checkout.provider.js';

const env = parseEnv(process.env);

function buildRedisConnection(redisUrl: string): RedisOptions {
  const parsed = new URL(redisUrl);
  const dbCandidate = parsed.pathname.replace('/', '').trim();
  const parsedDb = dbCandidate.length > 0 ? Number.parseInt(dbCandidate, 10) : undefined;

  return {
    host: parsed.hostname,
    port: parsed.port.length > 0 ? Number.parseInt(parsed.port, 10) : 6379,
    username: parsed.username.length > 0 ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password.length > 0 ? decodeURIComponent(parsed.password) : undefined,
    db: Number.isInteger(parsedDb) ? parsedDb : undefined,
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}

@Module({
  imports: [
    PrismaModule,
    BullModule.forRoot({
      connection: buildRedisConnection(env.REDIS_URL),
      prefix: env.QUEUE_PREFIX,
      extraOptions: {
        manualRegistration: env.NODE_ENV === 'test' || process.env.CI === 'true',
      },
    }),
    BullModule.registerQueue({
      name: ORDER_CONFIRMATION_EMAIL_QUEUE,
    }),
  ],
  controllers: [CheckoutController],
  providers: [
    CheckoutService,
    StripeCheckoutProvider,
    OrderConfirmationEmailMailerService,
    OrderConfirmationEmailQueueService,
    OrderConfirmationEmailProcessor,
  ],
  exports: [CheckoutService, StripeCheckoutProvider, OrderConfirmationEmailQueueService],
})
export class CheckoutModule {}
