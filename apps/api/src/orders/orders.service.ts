import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { OrderRecord } from '@shoppilot/db/order-contract';
import type { AuthenticatedRequestUser } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { mapOrderRecord, orderWithItemsInclude } from './orders.mapper.js';

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
}
