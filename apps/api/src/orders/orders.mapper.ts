import type {
  OrderLineItemSnapshot,
  OrderRecord,
  OrderStatus,
} from '@shoppilot/db/order-contract';
import { OrderStatus as PrismaOrderStatus, ProductSize, type Prisma } from '@prisma/client';

export const orderWithItemsInclude = {
  items: {
    orderBy: {
      createdAt: 'asc',
    },
  },
} satisfies Prisma.OrderInclude;

export type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof orderWithItemsInclude }>;

function mapProductSize(size: ProductSize): OrderLineItemSnapshot['size'] {
  switch (size) {
    case ProductSize.S:
      return 's';
    case ProductSize.L:
      return 'l';
    case ProductSize.XL:
      return 'xl';
    case ProductSize.M:
    default:
      return 'm';
  }
}

function mapOrderStatus(status: PrismaOrderStatus): OrderStatus {
  switch (status) {
    case PrismaOrderStatus.PAID:
      return 'paid';
    case PrismaOrderStatus.PROCESSING:
      return 'processing';
    case PrismaOrderStatus.SHIPPED:
      return 'shipped';
    case PrismaOrderStatus.DELIVERED:
      return 'delivered';
    case PrismaOrderStatus.CANCELLED:
      return 'cancelled';
    case PrismaOrderStatus.REFUNDED:
      return 'refunded';
    case PrismaOrderStatus.PENDING_PAYMENT:
    default:
      return 'pending_payment';
  }
}

export function mapOrderRecord(order: OrderWithItems): OrderRecord {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: mapOrderStatus(order.status),
    payment: {
      provider: order.paymentProvider,
      providerSessionId: order.paymentProviderSessionId,
    },
    contact: {
      email: order.contactEmail,
      phone: order.contactPhone,
    },
    totals: {
      currency: order.currency,
      subtotalCents: order.subtotalCents,
      shippingCents: order.shippingCents,
      taxCents: order.taxCents,
      totalCents: order.totalCents,
    },
    shipping: {
      recipientName: order.shipToRecipientName,
      country: order.shipToCountry,
      city: order.shipToCity,
      postalCode: order.shipToPostalCode,
      line1: order.shipToLine1,
      line2: order.shipToLine2,
      phone: order.shipToPhone,
      methodName: order.shippingMethodName,
      etaLabel: order.shippingEtaLabel,
    },
    items: order.items.map((item) => ({
      orderLineItemId: item.id,
      productId: item.productId,
      productSlug: item.productSlug,
      productName: item.productName,
      productFit: item.productFit,
      productColor: item.productColor,
      size: mapProductSize(item.productSize),
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineSubtotalCents: item.lineSubtotalCents,
      currency: item.currency,
      primaryImageUrl: item.primaryImageUrl,
      secondaryImageUrl: item.secondaryImageUrl,
    })),
    statusTimestamps: {
      paidAt: order.paidAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      refundedAt: order.refundedAt?.toISOString() ?? null,
      shippedAt: order.shippedAt?.toISOString() ?? null,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
    },
    refundPlaceholder: {
      status: order.refundStatusPlaceholder,
      reason: order.refundReasonPlaceholder,
      externalReference: order.refundExternalRefPlaceholder,
    },
    createdBy: order.createdBy,
    updatedBy: order.updatedBy,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
