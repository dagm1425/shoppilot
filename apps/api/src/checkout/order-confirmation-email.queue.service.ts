import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Queue } from 'bullmq';
import { parseEnv } from '../config/env.js';
import {
  ORDER_CONFIRMATION_EMAIL_QUEUE,
  SEND_ORDER_CONFIRMATION_JOB,
  buildOrderConfirmationJobId,
  parseOrderConfirmationEmailJobPayload,
  type OrderConfirmationEmailJobPayload,
} from './order-confirmation-email.job.js';

export type OrderConfirmationQueueHealthSnapshot = {
  queueName: string;
  generatedAt: string;
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
};

@Injectable()
export class OrderConfirmationEmailQueueService {
  private readonly logger = new Logger(OrderConfirmationEmailQueueService.name);
  private readonly env = parseEnv(process.env);

  constructor(
    @InjectQueue(ORDER_CONFIRMATION_EMAIL_QUEUE)
    private readonly orderConfirmationQueue: Queue<OrderConfirmationEmailJobPayload>,
  ) {}

  async enqueueOrderConfirmationEmail(input: OrderConfirmationEmailJobPayload): Promise<void> {
    let payload: OrderConfirmationEmailJobPayload;

    try {
      payload = parseOrderConfirmationEmailJobPayload(input);
    } catch (error) {
      this.logger.error({
        event: 'order.confirmation-email.job',
        status: 'failed',
        queueName: ORDER_CONFIRMATION_EMAIL_QUEUE,
        jobName: SEND_ORDER_CONFIRMATION_JOB,
        requestId: input.requestId ?? 'unknown-request-id',
        orderId: input.orderId,
        reason: this.resolveErrorMessage(error),
        phase: 'payload-validate',
      });

      this.captureException(error, {
        queueName: ORDER_CONFIRMATION_EMAIL_QUEUE,
        jobName: SEND_ORDER_CONFIRMATION_JOB,
        requestId: input.requestId ?? 'unknown-request-id',
        orderId: input.orderId,
        phase: 'payload-validate',
      });
      return;
    }

    const jobId = buildOrderConfirmationJobId(payload.orderId);

    try {
      await this.orderConfirmationQueue.add(SEND_ORDER_CONFIRMATION_JOB, payload, {
        jobId,
        attempts: this.env.ORDER_CONFIRMATION_JOB_ATTEMPTS,
        backoff: {
          type: 'fixed',
          delay: this.env.ORDER_CONFIRMATION_JOB_BACKOFF_MS,
        },
        // future: dead-letter queue - deferred until queue metrics and replay policy are defined
        // future: admin job replay - deferred until admin audit-log surface exists
      });

      this.logger.log({
        event: 'order.confirmation-email.job',
        status: 'queued',
        queueName: ORDER_CONFIRMATION_EMAIL_QUEUE,
        jobName: SEND_ORDER_CONFIRMATION_JOB,
        jobId,
        requestId: payload.requestId ?? 'unknown-request-id',
        source: payload.source ?? 'return-flow',
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        queuedAt: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error({
        event: 'order.confirmation-email.job',
        status: 'failed',
        queueName: ORDER_CONFIRMATION_EMAIL_QUEUE,
        jobName: SEND_ORDER_CONFIRMATION_JOB,
        jobId,
        requestId: payload.requestId ?? 'unknown-request-id',
        source: payload.source ?? 'return-flow',
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        reason: this.resolveErrorMessage(error),
        phase: 'enqueue',
      });

      this.captureException(error, {
        queueName: ORDER_CONFIRMATION_EMAIL_QUEUE,
        jobName: SEND_ORDER_CONFIRMATION_JOB,
        jobId,
        requestId: payload.requestId ?? 'unknown-request-id',
        source: payload.source ?? 'return-flow',
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        phase: 'enqueue',
      });
    }
  }

  async getQueueHealthSnapshot(): Promise<OrderConfirmationQueueHealthSnapshot> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.orderConfirmationQueue.getWaitingCount(),
      this.orderConfirmationQueue.getActiveCount(),
      this.orderConfirmationQueue.getCompletedCount(),
      this.orderConfirmationQueue.getFailedCount(),
    ]);

    return {
      queueName: ORDER_CONFIRMATION_EMAIL_QUEUE,
      generatedAt: new Date().toISOString(),
      counts: {
        waiting,
        active,
        completed,
        failed,
      },
    };
  }

  private captureException(
    error: unknown,
    context: Record<string, string | number | boolean | null | undefined>,
  ): void {
    const exception = error instanceof Error ? error : new Error('Unknown queue failure.');

    Sentry.withScope((scope) => {
      scope.setTag('queue.name', ORDER_CONFIRMATION_EMAIL_QUEUE);
      scope.setTag('queue.job', SEND_ORDER_CONFIRMATION_JOB);

      for (const [key, value] of Object.entries(context)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          scope.setTag(`queue.${key}`, String(value));
        }
      }

      scope.setContext('queue-job', context);
      Sentry.captureException(exception);
    });
  }

  private resolveErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown queue failure.';
  }
}
