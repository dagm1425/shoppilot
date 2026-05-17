import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Job } from 'bullmq';
import { OrderConfirmationEmailMailerService } from './order-confirmation-email.mailer.service.js';
import {
  ORDER_CONFIRMATION_EMAIL_QUEUE,
  SEND_ORDER_CONFIRMATION_JOB,
  parseOrderConfirmationEmailJobPayload,
  type OrderConfirmationEmailJobPayload,
} from './order-confirmation-email.job.js';

@Processor(ORDER_CONFIRMATION_EMAIL_QUEUE)
export class OrderConfirmationEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderConfirmationEmailProcessor.name);

  constructor(
    @Inject(OrderConfirmationEmailMailerService)
    private readonly orderConfirmationMailer: OrderConfirmationEmailMailerService,
  ) {
    super();
  }

  async process(job: Job<OrderConfirmationEmailJobPayload>): Promise<void> {
    const startedAt = Date.now();
    const jobId = String(job.id ?? 'unknown-job-id');

    if (job.name !== SEND_ORDER_CONFIRMATION_JOB) {
      this.logger.warn({
        event: 'order.confirmation-email.job',
        status: 'failed',
        queueName: ORDER_CONFIRMATION_EMAIL_QUEUE,
        jobName: job.name,
        jobId,
        reason: 'Unsupported job name.',
        phase: 'dispatch',
      });
      return;
    }

    let payload: OrderConfirmationEmailJobPayload;

    try {
      payload = parseOrderConfirmationEmailJobPayload(job.data);
    } catch (error) {
      this.logger.error({
        event: 'order.confirmation-email.job',
        status: 'failed',
        queueName: ORDER_CONFIRMATION_EMAIL_QUEUE,
        jobName: job.name,
        jobId,
        reason: this.resolveErrorMessage(error),
        durationMs: Date.now() - startedAt,
        phase: 'payload-validate',
      });
      this.captureException(error, jobId, undefined, 'payload-validate');
      throw error;
    }

    this.logger.log({
      event: 'order.confirmation-email.job',
      status: 'processing',
      queueName: ORDER_CONFIRMATION_EMAIL_QUEUE,
      jobName: SEND_ORDER_CONFIRMATION_JOB,
      jobId,
      requestId: payload.requestId ?? 'unknown-request-id',
      source: payload.source ?? 'return-flow',
      orderId: payload.orderId,
      orderNumber: payload.orderNumber,
    });

    try {
      await this.orderConfirmationMailer.sendOrderConfirmationEmail(payload);

      this.logger.log({
        event: 'order.confirmation-email.job',
        status: 'sent',
        queueName: ORDER_CONFIRMATION_EMAIL_QUEUE,
        jobName: SEND_ORDER_CONFIRMATION_JOB,
        jobId,
        requestId: payload.requestId ?? 'unknown-request-id',
        source: payload.source ?? 'return-flow',
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        durationMs: Date.now() - startedAt,
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
        durationMs: Date.now() - startedAt,
        phase: 'send-email',
      });

      this.captureException(error, jobId, payload, 'send-email');
      throw error;
    }
  }

  private captureException(
    error: unknown,
    jobId: string,
    payload: OrderConfirmationEmailJobPayload | undefined,
    phase: 'payload-validate' | 'send-email',
  ): void {
    const exception = error instanceof Error ? error : new Error('Unknown job processing failure.');

    Sentry.withScope((scope) => {
      scope.setTag('queue.name', ORDER_CONFIRMATION_EMAIL_QUEUE);
      scope.setTag('queue.job', SEND_ORDER_CONFIRMATION_JOB);
      scope.setTag('queue.phase', phase);
      scope.setTag('queue.jobId', jobId);

      if (payload?.orderId) {
        scope.setTag('queue.orderId', payload.orderId);
      }

      if (payload?.orderNumber) {
        scope.setTag('queue.orderNumber', payload.orderNumber);
      }

      scope.setContext('queue-job', {
        jobId,
        phase,
        payload,
      });
      Sentry.captureException(exception);
    });
  }

  private resolveErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown job processing failure.';
  }
}
