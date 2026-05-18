import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { RequestWithContext } from '../common/request-context.js';

type RequestWithTrackingFields = RequestWithContext & {
  ip?: string;
  ips?: string[];
  headers?: Record<string, string | string[] | undefined>;
};

@Injectable()
export class AiThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(request: Record<string, unknown>): Promise<string> {
    const requestWithTracking = request as unknown as RequestWithTrackingFields;

    if (requestWithTracking.user?.id) {
      return `user:${requestWithTracking.user.id}`;
    }

    const forwardedHeader = requestWithTracking.headers?.['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwardedHeader)
      ? forwardedHeader[0]?.trim()
      : forwardedHeader?.split(',')[0]?.trim();

    const resolvedIp = requestWithTracking.ips?.[0]
      ?? forwardedIp
      ?? requestWithTracking.ip
      ?? 'unknown-ip';

    return `ip:${resolvedIp}`;
  }
}
