import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { RequestWithContext } from '../common/request-context.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequestUser } from '../auth/auth.types.js';
import { parseAddWishlistItemOrThrow, parseWishlistItemIdOrThrow } from './wishlist.schemas.js';
import { WishlistService } from './wishlist.service.js';

@Controller('wishlist')
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(@Inject(WishlistService) private readonly wishlistService: WishlistService) {}

  @Get()
  async getWishlist(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() request: RequestWithContext,
  ) {
    Sentry.setTag('wishlist.operation', 'get');

    return Sentry.startSpan(
      {
        name: 'wishlist.get',
        op: 'http.server',
      },
      async () => this.wishlistService.getWishlist(user, request.requestId),
    );
  }

  @Post('items')
  async addItem(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() body: unknown,
    @Req() request: RequestWithContext,
  ) {
    const input = parseAddWishlistItemOrThrow(body);
    Sentry.setTag('wishlist.operation', 'add-item');

    return Sentry.startSpan(
      {
        name: 'wishlist.add-item',
        op: 'http.server',
      },
      async () => this.wishlistService.addItem(user, input, request.requestId),
    );
  }

  @Delete('items/:itemId')
  async removeItem(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('itemId') itemId: string,
    @Req() request: RequestWithContext,
  ) {
    const parsedItemId = parseWishlistItemIdOrThrow(itemId);
    Sentry.setTag('wishlist.operation', 'remove-item');

    return Sentry.startSpan(
      {
        name: 'wishlist.remove-item',
        op: 'http.server',
      },
      async () => this.wishlistService.removeItem(user, parsedItemId, request.requestId),
    );
  }
}
