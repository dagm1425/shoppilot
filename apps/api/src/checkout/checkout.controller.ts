import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequestUser } from '../auth/auth.types.js';
import type { RequestWithContext } from '../common/request-context.js';
import {
  parseCheckoutSessionTokenOrThrow,
  parseSelectCheckoutAddressInputOrThrow,
  parseUpdateCheckoutContactInputOrThrow,
} from './checkout.schemas.js';
import { CheckoutService } from './checkout.service.js';

@Controller('checkout')
@UseGuards(JwtAuthGuard)
export class CheckoutController {
  constructor(@Inject(CheckoutService) private readonly checkoutService: CheckoutService) {}

  @Post('session')
  @HttpCode(200)
  async startSession(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() request: RequestWithContext,
  ) {
    Sentry.setTag('checkout.operation', 'start-session');

    return Sentry.startSpan(
      {
        name: 'checkout.session.start',
        op: 'http.server',
      },
      async () => this.checkoutService.startSession(user, request.requestId),
    );
  }

  @Get('session/:token')
  async getSession(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('token') token: string,
    @Req() request: RequestWithContext,
  ) {
    const parsedToken = parseCheckoutSessionTokenOrThrow(token);
    Sentry.setTag('checkout.operation', 'get-session');

    return Sentry.startSpan(
      {
        name: 'checkout.session.get',
        op: 'http.server',
      },
      async () => this.checkoutService.getSession(user, parsedToken, request.requestId),
    );
  }

  @Patch('session/:token/address')
  async setSessionAddress(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() request: RequestWithContext,
  ) {
    const parsedToken = parseCheckoutSessionTokenOrThrow(token);
    const input = parseSelectCheckoutAddressInputOrThrow(body);
    Sentry.setTag('checkout.operation', 'set-address');

    return Sentry.startSpan(
      {
        name: 'checkout.session.set-address',
        op: 'http.server',
      },
      async () => this.checkoutService.selectAddress(user, parsedToken, input, request.requestId),
    );
  }

  @Patch('session/:token/contact')
  async setSessionContact(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() request: RequestWithContext,
  ) {
    const parsedToken = parseCheckoutSessionTokenOrThrow(token);
    const input = parseUpdateCheckoutContactInputOrThrow(body);
    Sentry.setTag('checkout.operation', 'set-contact');

    return Sentry.startSpan(
      {
        name: 'checkout.session.set-contact',
        op: 'http.server',
      },
      async () => this.checkoutService.updateContact(user, parsedToken, input, request.requestId),
    );
  }
}
