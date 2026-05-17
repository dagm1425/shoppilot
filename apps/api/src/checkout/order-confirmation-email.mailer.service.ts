import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import { parseEnv } from '../config/env.js';
import type { OrderConfirmationEmailJobPayload } from './order-confirmation-email.job.js';

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

@Injectable()
export class OrderConfirmationEmailMailerService {
  async sendOrderConfirmationEmail(input: OrderConfirmationEmailJobPayload): Promise<void> {
    const env = parseEnv(process.env);
    const resend = new Resend(env.RESEND_API_KEY);
    const orderUrl = `${env.WEB_ORIGIN}/orders/${encodeURIComponent(input.orderNumber)}`;
    const paidAtLabel = new Date(input.paidAtIso).toLocaleString('en-US');
    const totalLabel = formatMoney(input.totalCents, input.currency);
    // future: notification template localization - deferred until locale preferences are modeled
    const subject = `ShopPilot order confirmation ${input.orderNumber}`;
    const text = [
      `Thanks for your order ${input.orderNumber}.`,
      `Total paid: ${totalLabel}.`,
      `Payment confirmed at: ${paidAtLabel}.`,
      `View your order: ${orderUrl}`,
    ].join('\n');
    const html = [
      `<p>Thanks for your order <strong>${input.orderNumber}</strong>.</p>`,
      `<p>Total paid: <strong>${totalLabel}</strong>.</p>`,
      `<p>Payment confirmed at: ${paidAtLabel}.</p>`,
      `<p><a href="${orderUrl}">View your order details</a></p>`,
    ].join('');

    const response = await resend.emails.send({
      from: `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM_ADDRESS}>`,
      to: [input.recipientEmail],
      subject,
      text,
      html,
    });

    if (!response.error) {
      return;
    }

    throw new Error(response.error.message);
  }
}
