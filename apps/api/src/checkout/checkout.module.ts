import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CheckoutController } from './checkout.controller.js';
import { CheckoutService } from './checkout.service.js';
import { StripeCheckoutProvider } from './stripe-checkout.provider.js';

@Module({
  imports: [PrismaModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, StripeCheckoutProvider],
  exports: [CheckoutService, StripeCheckoutProvider],
})
export class CheckoutModule {}
