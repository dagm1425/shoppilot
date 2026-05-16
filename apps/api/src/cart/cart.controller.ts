import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { RequestWithContext } from '../common/request-context.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequestUser } from '../auth/auth.types.js';
import {
  parseAddCartItemOrThrow,
  parseCartItemIdOrThrow,
  parseUpdateCartItemOrThrow,
} from './cart.schemas.js';
import { CartService } from './cart.service.js';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(@Inject(CartService) private readonly cartService: CartService) {}

  @Get()
  async getCart(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() request: RequestWithContext,
  ) {
    Sentry.setTag('cart.operation', 'get');

    return Sentry.startSpan(
      {
        name: 'cart.get',
        op: 'http.server',
      },
      async () => this.cartService.getCart(user, request.requestId),
    );
  }

  @Post('items')
  async addItem(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() body: unknown,
    @Req() request: RequestWithContext,
  ) {
    const input = parseAddCartItemOrThrow(body);
    Sentry.setTag('cart.operation', 'add-item');

    return Sentry.startSpan(
      {
        name: 'cart.add-item',
        op: 'http.server',
      },
      async () => this.cartService.addItem(user, input, request.requestId),
    );
  }

  @Patch('items/:itemId')
  async updateItem(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
    @Req() request: RequestWithContext,
  ) {
    const parsedItemId = parseCartItemIdOrThrow(itemId);
    const input = parseUpdateCartItemOrThrow(body);
    Sentry.setTag('cart.operation', 'update-item');

    return Sentry.startSpan(
      {
        name: 'cart.update-item',
        op: 'http.server',
      },
      async () => this.cartService.updateItem(user, parsedItemId, input, request.requestId),
    );
  }

  @Delete('items/:itemId')
  async removeItem(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('itemId') itemId: string,
    @Req() request: RequestWithContext,
  ) {
    const parsedItemId = parseCartItemIdOrThrow(itemId);
    Sentry.setTag('cart.operation', 'remove-item');

    return Sentry.startSpan(
      {
        name: 'cart.remove-item',
        op: 'http.server',
      },
      async () => this.cartService.removeItem(user, parsedItemId, request.requestId),
    );
  }
}
