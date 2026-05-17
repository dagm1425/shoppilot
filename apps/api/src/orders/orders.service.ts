import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { AdminHomeSummaryResponse, AdminRevenueTrendPoint } from '@shoppilot/db/admin-dashboard-contract';
import type { AdminOrdersListQuery, AdminOrdersListResponse } from '@shoppilot/db/admin-orders-contract';
import type { OrderRecord } from '@shoppilot/db/order-contract';
import { OrderStatus as PrismaOrderStatus, type Prisma } from '@prisma/client';
import type { AuthenticatedRequestUser } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  mapOrderRecord,
  mapOrderStatus,
  mapOrderStatusToPrisma,
  orderWithItemsInclude,
} from './orders.mapper.js';

const REVENUE_WINDOW_DAYS = 30;
const RECENT_ORDERS_LIMIT = 10;
const DEFAULT_CURRENCY = 'USD';

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date: Date, days: number): Date {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateOnlyToUtcStart(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function buildRevenueTrend(
  paidOrders: Array<{ paidAt: Date | null; totalCents: number }>,
  startDate: Date,
  dayCount: number,
): AdminRevenueTrendPoint[] {
  const points: AdminRevenueTrendPoint[] = [];
  const totalsByDay = new Map<string, number>();

  for (let offset = 0; offset < dayCount; offset += 1) {
    const day = addDays(startDate, offset);
    const key = toDayKey(day);
    totalsByDay.set(key, 0);
    points.push({
      date: key,
      totalCents: 0,
    });
  }

  for (const order of paidOrders) {
    if (!order.paidAt) {
      continue;
    }

    const key = toDayKey(order.paidAt);
    if (!totalsByDay.has(key)) {
      continue;
    }

    totalsByDay.set(key, (totalsByDay.get(key) ?? 0) + order.totalCents);
  }

  return points.map((point) => ({
    ...point,
    totalCents: totalsByDay.get(point.date) ?? 0,
  }));
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getOrderByNumber(
    user: AuthenticatedRequestUser,
    orderNumber: string,
    requestId?: string,
  ): Promise<OrderRecord> {
    const order = await this.prisma.order.findFirst({
      where: {
        userId: user.id,
        orderNumber,
      },
      include: orderWithItemsInclude,
    });

    if (!order) {
      throw new HttpException(
        {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found.',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const response = mapOrderRecord(order);

    this.logger.log({
      event: 'order.read',
      requestId: requestId ?? 'unknown-request-id',
      userId: user.id,
      orderId: response.orderId,
      orderNumber: response.orderNumber,
      outcome: 'success',
    });

    return response;
  }

  async getAdminHomeSummary(requestId?: string): Promise<AdminHomeSummaryResponse> {
    const now = new Date();
    const todayStart = startOfDay(now);
    const tomorrowStart = addDays(todayStart, 1);
    const revenueWindowStart = addDays(todayStart, -(REVENUE_WINDOW_DAYS - 1));

    const [
      ordersToday,
      pendingPaymentOrders,
      paidOrdersToday,
      grossRevenueToday,
      paidOrdersForTrend,
      recentOrders,
    ] = await Promise.all([
      this.prisma.order.count({
        where: {
          createdAt: {
            gte: todayStart,
            lt: tomorrowStart,
          },
        },
      }),
      this.prisma.order.count({
        where: {
          status: PrismaOrderStatus.PENDING_PAYMENT,
        },
      }),
      this.prisma.order.count({
        where: {
          paidAt: {
            gte: todayStart,
            lt: tomorrowStart,
          },
        },
      }),
      this.prisma.order.aggregate({
        _sum: {
          totalCents: true,
        },
        where: {
          paidAt: {
            gte: todayStart,
            lt: tomorrowStart,
          },
        },
      }),
      this.prisma.order.findMany({
        where: {
          paidAt: {
            gte: revenueWindowStart,
            lt: tomorrowStart,
          },
        },
        select: {
          paidAt: true,
          totalCents: true,
        },
      }),
      this.prisma.order.findMany({
        orderBy: {
          createdAt: 'desc',
        },
        take: RECENT_ORDERS_LIMIT,
        select: {
          id: true,
          orderNumber: true,
          contactEmail: true,
          status: true,
          totalCents: true,
          currency: true,
          createdAt: true,
        },
      }),
    ]);

    const response: AdminHomeSummaryResponse = {
      generatedAt: now.toISOString(),
      currency: recentOrders[0]?.currency ?? DEFAULT_CURRENCY,
      kpis: {
        ordersToday,
        grossRevenueTodayCents: grossRevenueToday._sum.totalCents ?? 0,
        paidOrdersToday,
        pendingPaymentOrders,
      },
      revenueTrendLast30Days: buildRevenueTrend(
        paidOrdersForTrend,
        revenueWindowStart,
        REVENUE_WINDOW_DAYS,
      ),
      recentOrders: recentOrders.map((order) => ({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerEmail: order.contactEmail,
        status: mapOrderStatus(order.status),
        totalCents: order.totalCents,
        currency: order.currency,
        createdAt: order.createdAt.toISOString(),
      })),
    };

    this.logger.log({
      event: 'admin.home.summary.read',
      requestId: requestId ?? 'unknown-request-id',
      ordersToday,
      paidOrdersToday,
      pendingPaymentOrders,
      grossRevenueTodayCents: response.kpis.grossRevenueTodayCents,
      recentOrdersCount: response.recentOrders.length,
      outcome: 'success',
    });

    return response;
  }

  async getAdminOrdersList(
    query: AdminOrdersListQuery,
    requestId?: string,
  ): Promise<AdminOrdersListResponse> {
    const createdAtFilter: Prisma.DateTimeFilter | undefined =
      query.dateFrom || query.dateTo
        ? {
            ...(query.dateFrom
              ? {
                  gte: parseDateOnlyToUtcStart(query.dateFrom),
                }
              : {}),
            ...(query.dateTo
              ? {
                  lt: addDays(parseDateOnlyToUtcStart(query.dateTo), 1),
                }
              : {}),
          }
        : undefined;

    const where: Prisma.OrderWhereInput = {
      ...(query.status
        ? {
            status: mapOrderStatusToPrisma(query.status),
          }
        : {}),
      ...(query.customer
        ? {
            contactEmail: {
              contains: query.customer,
              mode: 'insensitive',
            },
          }
        : {}),
      ...(createdAtFilter
        ? {
            createdAt: createdAtFilter,
          }
        : {}),
    };

    const skip = (query.page - 1) * query.pageSize;

    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: query.pageSize,
        select: {
          id: true,
          orderNumber: true,
          contactEmail: true,
          status: true,
          totalCents: true,
          currency: true,
          createdAt: true,
          paidAt: true,
        },
      }),
      this.prisma.order.count({
        where,
      }),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / query.pageSize);

    const response: AdminOrdersListResponse = {
      generatedAt: new Date().toISOString(),
      items: orders.map((order) => ({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerEmail: order.contactEmail,
        status: mapOrderStatus(order.status),
        totalCents: order.totalCents,
        currency: order.currency,
        createdAt: order.createdAt.toISOString(),
        paidAt: order.paidAt?.toISOString() ?? null,
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages,
      },
      appliedFilters: {
        status: query.status,
        customer: query.customer,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      },
    };

    this.logger.log({
      event: 'admin.orders.list.read',
      requestId: requestId ?? 'unknown-request-id',
      page: response.pagination.page,
      pageSize: response.pagination.pageSize,
      total: response.pagination.total,
      status: query.status,
      customer: query.customer,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      outcome: 'success',
    });

    return response;
  }
}
