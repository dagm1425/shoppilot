import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { parseEnv } from '../config/env.js';

type PasswordResetMailInput = {
  userId: string;
  email: string;
  resetToken: string;
  requestId?: string;
};

export function buildPasswordResetUrl(baseUrl: string, resetToken: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('token', resetToken);
  return url.toString();
}

@Injectable()
export class PasswordResetMailerService {
  private readonly logger = new Logger(PasswordResetMailerService.name);

  async sendResetLink(input: PasswordResetMailInput): Promise<void> {
    const env = parseEnv(process.env);

    const resetUrl = buildPasswordResetUrl(env.EMAIL_RESET_BASE_URL, input.resetToken);
    const resend = new Resend(env.RESEND_API_KEY);

    try {
      const { error } = await resend.emails.send({
        from: `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM_ADDRESS}>`,
        to: [input.email],
        subject: 'ShopPilot password reset',
        text: `Reset your ShopPilot password using this link: ${resetUrl}`,
        html: `<p>Reset your ShopPilot password by clicking the link below:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
      });

      if (!error) {
        return;
      }

      throw new Error(error.message);
    } catch (error) {
      const emailHash = createHash('sha256').update(input.email).digest('hex');
      this.logger.error({
        message: 'Password reset delivery failed',
        code: 'AUTH_RESET_DELIVERY_FAILED',
        requestId: input.requestId ?? 'unknown-request-id',
        userId: input.userId,
        emailHash,
        deliveryMode: 'resend_api',
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }
}
