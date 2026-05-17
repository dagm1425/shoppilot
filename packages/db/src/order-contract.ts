export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export type OrderLineItemSnapshot = {
  orderLineItemId: string;
  productId: string | null;
  productSlug: string;
  productName: string;
  productFit: string;
  productColor: string;
  size: 's' | 'm' | 'l' | 'xl';
  quantity: number;
  unitPriceCents: number;
  lineSubtotalCents: number;
  currency: string;
  primaryImageUrl: string;
  secondaryImageUrl: string | null;
};

export type OrderShippingSnapshot = {
  recipientName: string;
  country: string;
  city: string;
  postalCode: string;
  line1: string;
  line2: string | null;
  phone: string | null;
  methodName: string;
  etaLabel: string;
};

export type OrderRecord = {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  payment: {
    provider: string;
    providerSessionId: string | null;
  };
  contact: {
    email: string;
    phone: string;
  };
  totals: {
    currency: string;
    subtotalCents: number;
    shippingCents: number;
    taxCents: number;
    totalCents: number;
  };
  shipping: OrderShippingSnapshot;
  items: OrderLineItemSnapshot[];
  statusTimestamps: {
    paidAt: string | null;
    cancelledAt: string | null;
    refundedAt: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
  };
  refundPlaceholder: {
    status: string | null;
    reason: string | null;
    externalReference: string | null;
  };
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type PlaceOrderInput = {
  checkoutSessionToken: string;
  idempotencyKey: string;
};

export type PlaceOrderResponse = OrderRecord;
