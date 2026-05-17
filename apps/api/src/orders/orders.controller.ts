import { Controller, Get, Inject, Param, Query, Req, UseGuards } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import type { AuthenticatedRequestUser } from '../auth/auth.types.js';
import type { RequestWithContext } from '../common/request-context.js';
import { parseAdminOrdersListQueryOrThrow, parseOrderNumberOrThrow } from './orders.schemas.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly ordersService: OrdersService) {}

  @Get('admin/home')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async getAdminHomeSummary(@Req() request: RequestWithContext) {
    Sentry.setTag('order.operation', 'admin-home-summary');

    return Sentry.startSpan(
      {
        name: 'admin.home.summary',
        op: 'http.server',
      },
      async () => this.ordersService.getAdminHomeSummary(request.requestId),
    );
  }

  @Get('admin/list')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async getAdminOrdersList(@Query() query: unknown, @Req() request: RequestWithContext) {
    const parsedQuery = parseAdminOrdersListQueryOrThrow(query);
    Sentry.setTag('order.operation', 'admin-orders-list');
    Sentry.setTag('order.list.status', parsedQuery.status ?? 'all');
    if (parsedQuery.customer) {
      Sentry.setTag('order.list.customer', 'active');
    }
    if (parsedQuery.dateFrom || parsedQuery.dateTo) {
      Sentry.setTag('order.list.date', 'active');
    }

    return Sentry.startSpan(
      {
        name: 'admin.orders.list',
        op: 'http.server',
      },
      async () => this.ordersService.getAdminOrdersList(parsedQuery, request.requestId),
    );
  }

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
