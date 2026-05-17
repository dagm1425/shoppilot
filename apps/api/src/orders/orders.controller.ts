import { Controller, Get, Inject, Param, Req, UseGuards } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequestUser } from '../auth/auth.types.js';
import type { RequestWithContext } from '../common/request-context.js';
import { parseOrderNumberOrThrow } from './orders.schemas.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly ordersService: OrdersService) {}

  @Get(':orderNumber')
  async getOrderByNumber(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('orderNumber') orderNumber: string,
    @Req() request: RequestWithContext,
  ) {
    const parsedOrderNumber = parseOrderNumberOrThrow(orderNumber);
    Sentry.setTag('order.operation', 'get-by-number');

    return Sentry.startSpan(
      {
        name: 'order.get',
        op: 'http.server',
      },
      async () => this.ordersService.getOrderByNumber(user, parsedOrderNumber, request.requestId),
    );
  }
}
