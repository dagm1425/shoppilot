import type { INestApplication } from '@nestjs/common';
import { OrderStatus as PrismaOrderStatus, PaymentWebhookEventStatus, ProductSize, Role } from '@prisma/client';
import { createTestApp } from '../helpers/test-app.js';
import type Stripe from 'stripe';

type MockUser = {
  id: string;
  username: string;
  email: string;
  role: Role;
  sessionVersion: number;
};

type MockProduct = {
  id: string;
  slug: string;
  name: string;
  fit: string;
  color: string;
  priceCents: number;
  currency: string;
  available: boolean;
  stock: number;
  primaryImageUrl: string;
  secondaryImageUrl: string | null;
};

type MockCart = {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
};

type MockCartItem = {
  id: string;
  cartId: string;
  productId: string;
  size: ProductSize;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
};

type MockAddress = {
  id: string;
  userId: string;
  recipientName: string;
  country: string;
  city: string;
  postalCode: string;
  line1: string;
  line2: string | null;
  phone: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type MockCheckoutSession = {
  id: string;
  token: string;
  userId: string;
  cartId: string;
  selectedAddressId: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  blockingReasons: unknown;
  cartSnapshot: unknown;
  priceValidatedAt: Date;
  pricingSnapshotId: string | null;
  paymentProviderSessionId: string | null;
  expiresAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type MockOrderLineItem = {
  id: string;
  orderId: string;
  productId: string | null;
  productSlug: string;
  productName: string;
  productFit: string;
  productColor: string;
  productSize: ProductSize;
  quantity: number;
  unitPriceCents: number;
  lineSubtotalCents: number;
  currency: string;
  primaryImageUrl: string;
  secondaryImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type MockOrder = {
  id: string;
  orderNumber: string;
  userId: string;
  checkoutSessionId: string;
  placeOrderIdempotencyKey: string;
  paymentProvider: string;
  paymentProviderSessionId: string | null;
  status: PrismaOrderStatus;
  currency: string;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  contactEmail: string;
  contactPhone: string;
  shippingMethodName: string;
  shippingEtaLabel: string;
  shipToRecipientName: string;
  shipToCountry: string;
  shipToCity: string;
  shipToPostalCode: string;
  shipToLine1: string;
  shipToLine2: string | null;
  shipToPhone: string | null;
  createdBy: string;
  updatedBy: string;
  paidAt: Date | null;
  cancelledAt: Date | null;
  refundedAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  refundStatusPlaceholder: string | null;
  refundReasonPlaceholder: string | null;
  refundExternalRefPlaceholder: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type MockWebhookEvent = {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  providerSessionId: string | null;
  status: PaymentWebhookEventStatus;
  checkoutSessionId: string | null;
  orderId: string | null;
  lastError: string | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type MockStripeSession = {
  id: string;
  status: 'open' | 'complete' | 'expired';
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  url: string;
};

type CheckoutSessionFindFirstArgs = {
  where?: {
    id?: string;
    token?: string;
    userId?: string;
    cartId?: string;
    isActive?: boolean;
    paymentProviderSessionId?: string;
    expiresAt?: { gt: Date };
  };
  orderBy?: {
    updatedAt?: 'asc' | 'desc';
  };
  include?: {
    selectedAddress?: boolean;
    cart?: unknown;
    order?: unknown;
  };
};

type OrderCreateItemInput = {
  productId?: string | null;
  productSlug: string;
  productName: string;
  productFit: string;
  productColor: string;
  productSize: ProductSize;
  quantity: number;
  unitPriceCents: number;
  lineSubtotalCents: number;
  currency: string;
  primaryImageUrl: string;
  secondaryImageUrl?: string | null;
};

type OrderCreateArgs = {
  data: {
    orderNumber: string;
    userId: string;
    checkoutSessionId: string;
    placeOrderIdempotencyKey: string;
    paymentProvider: string;
    paymentProviderSessionId?: string | null;
    status: PrismaOrderStatus;
    currency: string;
    subtotalCents: number;
    shippingCents: number;
    taxCents: number;
    totalCents: number;
    contactEmail: string;
    contactPhone: string;
    shippingMethodName?: string;
    shippingEtaLabel?: string;
    shipToRecipientName: string;
    shipToCountry: string;
    shipToCity: string;
    shipToPostalCode: string;
    shipToLine1: string;
    shipToLine2?: string | null;
    shipToPhone?: string | null;
    createdBy: string;
    updatedBy: string;
    paidAt?: Date | null;
    cancelledAt?: Date | null;
    refundedAt?: Date | null;
    shippedAt?: Date | null;
    deliveredAt?: Date | null;
    refundStatusPlaceholder?: string | null;
    refundReasonPlaceholder?: string | null;
    refundExternalRefPlaceholder?: string | null;
    items?: {
      create: OrderCreateItemInput[];
    };
  };
};

class InMemoryStripeWebhookProvider {
  private sessions = new Map<string, MockStripeSession>();

  reset() {
    this.sessions.clear();
  }

  seedSession(session: MockStripeSession) {
    this.sessions.set(session.id, session);
  }

  async retrieveSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Stripe session not found: ${sessionId}`);
    }
    return session;
  }

  constructWebhookEvent(
    rawBody: Buffer | string,
    signatureHeader: string,
    webhookSecret: string,
  ): Stripe.Event {
    if (signatureHeader !== `v1=${webhookSecret}`) {
      throw new Error('Invalid signature');
    }

    const payload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    return JSON.parse(payload) as Stripe.Event;
  }
}

class InMemoryWebhookPrisma {
  private idCounter = 100;
  private users = new Map<string, MockUser>();
  private usersByEmail = new Map<string, string>();
  private products = new Map<string, MockProduct>();
  private carts = new Map<string, MockCart>();
  private cartItems = new Map<string, MockCartItem>();
  private addresses = new Map<string, MockAddress>();
  private sessions = new Map<string, MockCheckoutSession>();
  private orders = new Map<string, MockOrder>();
  private orderItems = new Map<string, MockOrderLineItem>();
  private webhookEvents = new Map<string, MockWebhookEvent>();

  reset() {
    this.idCounter = 100;
    this.users.clear();
    this.usersByEmail.clear();
    this.products.clear();
    this.carts.clear();
    this.cartItems.clear();
    this.addresses.clear();
    this.sessions.clear();
    this.orders.clear();
    this.orderItems.clear();
    this.webhookEvents.clear();

    const user: MockUser = {
      id: 'user_webhook',
      username: 'webhook_user',
      email: 'webhook@shoppilot.local',
      role: Role.CUSTOMER,
      sessionVersion: 0,
    };

    this.users.set(user.id, user);
    this.usersByEmail.set(user.email, user.id);

    const product: MockProduct = {
      id: 'product_webhook_1',
      slug: 'arrival-seamless-tank',
      name: 'Arrival Seamless Tank',
      fit: 'Regular fit',
      color: 'Blue',
      priceCents: 5200,
      currency: 'USD',
      available: true,
      stock: 5,
      primaryImageUrl: 'https://example.com/webhook-tank-a.jpg',
      secondaryImageUrl: null,
    };
    this.products.set(product.id, product);

    const now = new Date();
    const cart: MockCart = {
      id: 'cart_webhook_1',
      userId: user.id,
      createdAt: now,
      updatedAt: now,
    };
    this.carts.set(cart.id, cart);

    const cartItem: MockCartItem = {
      id: 'cart_item_webhook_1',
      cartId: cart.id,
      productId: product.id,
      size: ProductSize.M,
      quantity: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.cartItems.set(cartItem.id, cartItem);

    const address: MockAddress = {
      id: 'address_webhook_1',
      userId: user.id,
      recipientName: 'Webhook User',
      country: 'ET',
      city: 'Addis Ababa',
      postalCode: '2000',
      line1: 'Bole',
      line2: null,
      phone: '0900000000',
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    };
    this.addresses.set(address.id, address);

    const session: MockCheckoutSession = {
      id: 'checkout_session_webhook_1',
      token: 'checkout_token_webhook_1',
      userId: user.id,
      cartId: cart.id,
      selectedAddressId: address.id,
      contactEmail: user.email,
      contactPhone: '0900000000',
      blockingReasons: [],
      cartSnapshot: {},
      priceValidatedAt: now,
      pricingSnapshotId: 'pricing_webhook_1',
      paymentProviderSessionId: 'cs_webhook_1',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, session);
  }

  getOrderCount(): number {
    return this.orders.size;
  }

  getOrderByCheckoutSessionId(sessionId: string): (MockOrder & { items: MockOrderLineItem[] }) | null {
    const order = [...this.orders.values()].find((entry) => entry.checkoutSessionId === sessionId);
    if (!order) {
      return null;
    }

    const items = [...this.orderItems.values()]
      .filter((entry) => entry.orderId === order.id)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((entry) => ({ ...entry }));

    return {
      ...order,
      items,
    };
  }

  getSessionById(sessionId: string): MockCheckoutSession | null {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : null;
  }

  getProductStock(productId: string): number {
    const product = this.products.get(productId);
    if (!product) {
      throw new Error(`Unknown product ${productId}`);
    }
    return product.stock;
  }

  getCartItemCount(cartId: string): number {
    return [...this.cartItems.values()].filter((item) => item.cartId === cartId).length;
  }

  getWebhookEvent(eventId: string): MockWebhookEvent | null {
    const event = this.webhookEvents.get(eventId);
    return event ? { ...event } : null;
  }

  seedPaidOrderForDefaultSession() {
    const existing = this.getOrderByCheckoutSessionId('checkout_session_webhook_1');
    if (existing) {
      return existing;
    }

    const now = new Date();
    const orderId = this.nextId('order');
    const order: MockOrder = {
      id: orderId,
      orderNumber: 'SP-20260517-PD0001',
      userId: 'user_webhook',
      checkoutSessionId: 'checkout_session_webhook_1',
      placeOrderIdempotencyKey: 'order:checkout_token_webhook_1:cs_webhook_1',
      paymentProvider: 'stripe',
      paymentProviderSessionId: 'cs_webhook_1',
      status: PrismaOrderStatus.PAID,
      currency: 'USD',
      subtotalCents: 5200,
      shippingCents: 500,
      taxCents: 221,
      totalCents: 5921,
      contactEmail: 'webhook@shoppilot.local',
      contactPhone: '0900000000',
      shippingMethodName: 'Standard Shipping',
      shippingEtaLabel: '3-5 days',
      shipToRecipientName: 'Webhook User',
      shipToCountry: 'ET',
      shipToCity: 'Addis Ababa',
      shipToPostalCode: '2000',
      shipToLine1: 'Bole',
      shipToLine2: null,
      shipToPhone: '0900000000',
      createdBy: 'user_webhook',
      updatedBy: 'user_webhook',
      paidAt: now,
      cancelledAt: null,
      refundedAt: null,
      shippedAt: null,
      deliveredAt: null,
      refundStatusPlaceholder: null,
      refundReasonPlaceholder: null,
      refundExternalRefPlaceholder: null,
      createdAt: now,
      updatedAt: now,
    };
    this.orders.set(order.id, order);

    const item: MockOrderLineItem = {
      id: this.nextId('order_item'),
      orderId,
      productId: 'product_webhook_1',
      productSlug: 'arrival-seamless-tank',
      productName: 'Arrival Seamless Tank',
      productFit: 'Regular fit',
      productColor: 'Blue',
      productSize: ProductSize.M,
      quantity: 1,
      unitPriceCents: 5200,
      lineSubtotalCents: 5200,
      currency: 'USD',
      primaryImageUrl: 'https://example.com/webhook-tank-a.jpg',
      secondaryImageUrl: null,
      createdAt: now,
      updatedAt: now,
    };
    this.orderItems.set(item.id, item);

    return this.getOrderByCheckoutSessionId('checkout_session_webhook_1');
  }

  readonly user = {
    findUnique: async (args: {
      where: { id?: string; email?: string };
      select?: { id?: boolean; username?: boolean; email?: boolean; role?: boolean; sessionVersion?: boolean };
    }) => {
      const userId = args.where.id ?? (args.where.email ? this.usersByEmail.get(args.where.email) : undefined);
      if (!userId) {
        return null;
      }

      const user = this.users.get(userId);
      if (!user) {
        return null;
      }

      if (!args.select) {
        return { ...user };
      }

      return {
        ...(args.select.id ? { id: user.id } : {}),
        ...(args.select.username ? { username: user.username } : {}),
        ...(args.select.email ? { email: user.email } : {}),
        ...(args.select.role ? { role: user.role } : {}),
        ...(args.select.sessionVersion ? { sessionVersion: user.sessionVersion } : {}),
      };
    },
  };

  readonly checkoutSession = {
    findFirst: async (args: CheckoutSessionFindFirstArgs) => {
      const where = args.where ?? {};
      let sessions = [...this.sessions.values()];

      if (where.id) {
        sessions = sessions.filter((session) => session.id === where.id);
      }
      if (where.token) {
        sessions = sessions.filter((session) => session.token === where.token);
      }
      if (where.userId) {
        sessions = sessions.filter((session) => session.userId === where.userId);
      }
      if (where.cartId) {
        sessions = sessions.filter((session) => session.cartId === where.cartId);
      }
      if (typeof where.isActive === 'boolean') {
        sessions = sessions.filter((session) => session.isActive === where.isActive);
      }
      if (where.paymentProviderSessionId) {
        sessions = sessions.filter(
          (session) => session.paymentProviderSessionId === where.paymentProviderSessionId,
        );
      }
      if (where.expiresAt?.gt instanceof Date) {
        const gt = where.expiresAt.gt.getTime();
        sessions = sessions.filter((session) => session.expiresAt.getTime() > gt);
      }

      if (args.orderBy?.updatedAt === 'desc') {
        sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      } else if (args.orderBy?.updatedAt === 'asc') {
        sessions.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
      }

      const first = sessions[0];
      if (!first) {
        return null;
      }

      return this.attachCheckoutSessionRelations(first, args.include);
    },

    updateMany: async (args: {
      where?: {
        userId?: string;
        cartId?: string;
        isActive?: boolean;
      };
      data: {
        isActive: boolean;
      };
    }) => {
      let count = 0;
      for (const session of this.sessions.values()) {
        if (args.where?.userId && session.userId !== args.where.userId) {
          continue;
        }
        if (args.where?.cartId && session.cartId !== args.where.cartId) {
          continue;
        }
        if (typeof args.where?.isActive === 'boolean' && session.isActive !== args.where.isActive) {
          continue;
        }

        session.isActive = args.data.isActive;
        session.updatedAt = new Date();
        this.sessions.set(session.id, session);
        count += 1;
      }

      return { count };
    },
  };

  readonly product = {
    updateMany: async (args: {
      where: {
        id: string;
        available?: boolean;
        stock?: { gte?: number };
      };
      data: {
        stock?: { decrement?: number };
      };
    }) => {
      const product = this.products.get(args.where.id);
      if (!product) {
        return { count: 0 };
      }

      if (args.where.available === true && !product.available) {
        return { count: 0 };
      }

      const minStock = args.where.stock?.gte;
      if (typeof minStock === 'number' && product.stock < minStock) {
        return { count: 0 };
      }

      const decrementBy = args.data.stock?.decrement ?? 0;
      product.stock -= decrementBy;
      this.products.set(product.id, product);

      return { count: 1 };
    },
  };

  readonly cartItem = {
    deleteMany: async (args: { where: { cartId: string } }) => {
      let count = 0;
      for (const [itemId, item] of this.cartItems.entries()) {
        if (item.cartId !== args.where.cartId) {
          continue;
        }
        this.cartItems.delete(itemId);
        count += 1;
      }
      return { count };
    },
  };

  readonly order = {
    create: async (args: OrderCreateArgs) => {
      const now = new Date();
      const orderId = this.nextId('order');
      const data = args.data;

      const order: MockOrder = {
        id: orderId,
        orderNumber: data.orderNumber,
        userId: data.userId,
        checkoutSessionId: data.checkoutSessionId,
        placeOrderIdempotencyKey: data.placeOrderIdempotencyKey,
        paymentProvider: data.paymentProvider,
        paymentProviderSessionId: data.paymentProviderSessionId ?? null,
        status: data.status,
        currency: data.currency,
        subtotalCents: data.subtotalCents,
        shippingCents: data.shippingCents,
        taxCents: data.taxCents,
        totalCents: data.totalCents,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        shippingMethodName: data.shippingMethodName ?? 'Standard Shipping',
        shippingEtaLabel: data.shippingEtaLabel ?? '3-5 days',
        shipToRecipientName: data.shipToRecipientName,
        shipToCountry: data.shipToCountry,
        shipToCity: data.shipToCity,
        shipToPostalCode: data.shipToPostalCode,
        shipToLine1: data.shipToLine1,
        shipToLine2: data.shipToLine2 ?? null,
        shipToPhone: data.shipToPhone ?? null,
        createdBy: data.createdBy,
        updatedBy: data.updatedBy,
        paidAt: data.paidAt ?? null,
        cancelledAt: data.cancelledAt ?? null,
        refundedAt: data.refundedAt ?? null,
        shippedAt: data.shippedAt ?? null,
        deliveredAt: data.deliveredAt ?? null,
        refundStatusPlaceholder: data.refundStatusPlaceholder ?? null,
        refundReasonPlaceholder: data.refundReasonPlaceholder ?? null,
        refundExternalRefPlaceholder: data.refundExternalRefPlaceholder ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.orders.set(order.id, order);

      const createdItems: MockOrderLineItem[] = (data.items?.create ?? []).map((item) => {
        const createdItem: MockOrderLineItem = {
          id: this.nextId('order_item'),
          orderId: order.id,
          productId: item.productId ?? null,
          productSlug: item.productSlug,
          productName: item.productName,
          productFit: item.productFit,
          productColor: item.productColor,
          productSize: item.productSize,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          lineSubtotalCents: item.lineSubtotalCents,
          currency: item.currency,
          primaryImageUrl: item.primaryImageUrl,
          secondaryImageUrl: item.secondaryImageUrl ?? null,
          createdAt: now,
          updatedAt: now,
        };
        this.orderItems.set(createdItem.id, createdItem);
        return createdItem;
      });

      return {
        ...order,
        items: createdItems,
      };
    },

    update: async (args: {
      where: { id: string };
      data: Partial<Pick<MockOrder, 'status' | 'cancelledAt' | 'updatedBy'>>;
    }) => {
      const existing = this.orders.get(args.where.id);
      if (!existing) {
        throw new Error(`Order not found: ${args.where.id}`);
      }

      const updated: MockOrder = {
        ...existing,
        ...args.data,
        updatedAt: new Date(),
      };
      this.orders.set(updated.id, updated);

      const items = [...this.orderItems.values()]
        .filter((item) => item.orderId === updated.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((item) => ({ ...item }));

      return {
        ...updated,
        items,
      };
    },
  };

  readonly paymentWebhookEvent = {
    upsert: async (args: {
      where: { eventId: string };
      create: {
        provider: string;
        eventId: string;
        eventType: string;
        providerSessionId: string | null;
        status: PaymentWebhookEventStatus;
      };
      update: {
        eventType: string;
        providerSessionId: string | null;
      };
    }) => {
      const existing = this.webhookEvents.get(args.where.eventId);
      if (existing) {
        const updated: MockWebhookEvent = {
          ...existing,
          eventType: args.update.eventType,
          providerSessionId: args.update.providerSessionId,
          updatedAt: new Date(),
        };
        this.webhookEvents.set(updated.eventId, updated);
        return { ...updated };
      }

      const now = new Date();
      const created: MockWebhookEvent = {
        id: this.nextId('webhook'),
        provider: args.create.provider,
        eventId: args.create.eventId,
        eventType: args.create.eventType,
        providerSessionId: args.create.providerSessionId,
        status: args.create.status,
        checkoutSessionId: null,
        orderId: null,
        lastError: null,
        processedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.webhookEvents.set(created.eventId, created);
      return { ...created };
    },

    updateMany: async (args: {
      where: {
        eventId: string;
        status?: { in?: PaymentWebhookEventStatus[] };
      };
      data: {
        status?: PaymentWebhookEventStatus;
        lastError?: string | null;
      };
    }) => {
      const existing = this.webhookEvents.get(args.where.eventId);
      if (!existing) {
        return { count: 0 };
      }

      const allowedStatuses = args.where.status?.in;
      if (allowedStatuses && !allowedStatuses.includes(existing.status)) {
        return { count: 0 };
      }

      const updated: MockWebhookEvent = {
        ...existing,
        status: args.data.status ?? existing.status,
        lastError: Object.prototype.hasOwnProperty.call(args.data, 'lastError')
          ? (args.data.lastError ?? null)
          : existing.lastError,
        updatedAt: new Date(),
      };
      this.webhookEvents.set(updated.eventId, updated);
      return { count: 1 };
    },

    findUnique: async (args: { where: { eventId: string } }) => {
      const existing = this.webhookEvents.get(args.where.eventId);
      return existing ? { ...existing } : null;
    },

    update: async (args: {
      where: { eventId: string };
      data: {
        status?: PaymentWebhookEventStatus;
        processedAt?: Date;
        checkoutSessionId?: string | null;
        orderId?: string | null;
        lastError?: string | null;
      };
    }) => {
      const existing = this.webhookEvents.get(args.where.eventId);
      if (!existing) {
        throw new Error(`Webhook event not found: ${args.where.eventId}`);
      }

      const updated: MockWebhookEvent = {
        ...existing,
        status: args.data.status ?? existing.status,
        processedAt: args.data.processedAt ?? existing.processedAt,
        checkoutSessionId: Object.prototype.hasOwnProperty.call(args.data, 'checkoutSessionId')
          ? (args.data.checkoutSessionId ?? null)
          : existing.checkoutSessionId,
        orderId: Object.prototype.hasOwnProperty.call(args.data, 'orderId')
          ? (args.data.orderId ?? null)
          : existing.orderId,
        lastError: Object.prototype.hasOwnProperty.call(args.data, 'lastError')
          ? (args.data.lastError ?? null)
          : existing.lastError,
        updatedAt: new Date(),
      };
      this.webhookEvents.set(updated.eventId, updated);
      return { ...updated };
    },
  };

  async $transaction<T>(input: Array<Promise<T>> | ((tx: this) => Promise<T>)): Promise<T[] | T> {
    if (typeof input === 'function') {
      return input(this);
    }
    return Promise.all(input);
  }

  private attachCheckoutSessionRelations(
    session: MockCheckoutSession,
    include?: CheckoutSessionFindFirstArgs['include'],
  ) {
    const payload: Record<string, unknown> = {
      ...session,
    };

    if (include?.selectedAddress) {
      payload.selectedAddress = session.selectedAddressId
        ? (this.addresses.get(session.selectedAddressId) ?? null)
        : null;
    }

    if (include?.cart) {
      const cart = this.carts.get(session.cartId);
      if (!cart) {
        throw new Error(`Cart missing for session ${session.id}`);
      }

      const items = [...this.cartItems.values()]
        .filter((item) => item.cartId === cart.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((item) => {
          const product = this.products.get(item.productId);
          if (!product) {
            throw new Error(`Product missing for cart item ${item.id}`);
          }
          return {
            ...item,
            product: { ...product },
          };
        });

      payload.cart = {
        ...cart,
        items,
      };
    }

    if (include?.order) {
      const order = [...this.orders.values()].find((entry) => entry.checkoutSessionId === session.id);

      if (!order) {
        payload.order = null;
      } else {
        const items = [...this.orderItems.values()]
          .filter((item) => item.orderId === order.id)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((item) => ({ ...item }));

        payload.order = {
          ...order,
          items,
        };
      }
    }

    return payload;
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}_${this.idCounter}`;
  }
}

function buildCheckoutSessionEvent(input: {
  eventId: string;
  eventType: string;
  sessionId: string;
}) {
  return {
    id: input.eventId,
    type: input.eventType,
    data: {
      object: {
        object: 'checkout.session',
        id: input.sessionId,
      },
    },
  };
}

describe('Checkout webhooks (integration)', () => {
  const prismaMock = new InMemoryWebhookPrisma();
  const stripeMock = new InMemoryStripeWebhookProvider();

  let app: INestApplication;
  let baseUrl = '';

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test_int';

    prismaMock.reset();
    stripeMock.reset();
    app = await createTestApp({
      prismaService: prismaMock as never,
      stripeCheckoutProvider: stripeMock as never,
    });

    await app.listen(0);
    const address = app.getHttpServer().address();

    if (typeof address !== 'object' || !address?.port) {
      throw new Error('Failed to bind integration server port');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    prismaMock.reset();
    stripeMock.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  async function postStripeWebhook(event: unknown, signature?: string) {
    return fetch(`${baseUrl}/webhooks/stripe`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature ?? `v1=${process.env.STRIPE_WEBHOOK_SECRET}`,
      },
      body: JSON.stringify(event),
    });
  }

  it('finalizes paid checkout via webhook when user never returns to app', async () => {
    stripeMock.seedSession({
      id: 'cs_webhook_1',
      status: 'complete',
      payment_status: 'paid',
      url: 'https://checkout.stripe.test/pay/cs_webhook_1',
    });

    const event = buildCheckoutSessionEvent({
      eventId: 'evt_paid_finalize_1',
      eventType: 'checkout.session.completed',
      sessionId: 'cs_webhook_1',
    });

    const response = await postStripeWebhook(event);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      received: boolean;
      processed: boolean;
      duplicate: boolean;
    };

    expect(payload).toEqual({
      received: true,
      processed: true,
      duplicate: false,
    });

    const order = prismaMock.getOrderByCheckoutSessionId('checkout_session_webhook_1');
    expect(order).not.toBeNull();
    expect(order?.status).toBe(PrismaOrderStatus.PAID);
    expect(order?.paidAt).not.toBeNull();
    expect(prismaMock.getOrderCount()).toBe(1);
    expect(prismaMock.getProductStock('product_webhook_1')).toBe(4);
    expect(prismaMock.getCartItemCount('cart_webhook_1')).toBe(0);
    expect(prismaMock.getSessionById('checkout_session_webhook_1')?.isActive).toBe(false);

    const storedEvent = prismaMock.getWebhookEvent('evt_paid_finalize_1');
    expect(storedEvent?.status).toBe(PaymentWebhookEventStatus.PROCESSED);
    expect(storedEvent?.orderId).toBe(order?.id ?? null);
    expect(storedEvent?.checkoutSessionId).toBe('checkout_session_webhook_1');
  });

  it('treats duplicate webhook delivery as idempotent no-op', async () => {
    stripeMock.seedSession({
      id: 'cs_webhook_1',
      status: 'complete',
      payment_status: 'paid',
      url: 'https://checkout.stripe.test/pay/cs_webhook_1',
    });

    const event = buildCheckoutSessionEvent({
      eventId: 'evt_duplicate_safe_1',
      eventType: 'checkout.session.completed',
      sessionId: 'cs_webhook_1',
    });

    const first = await postStripeWebhook(event);
    expect(first.status).toBe(200);

    const second = await postStripeWebhook(event);
    expect(second.status).toBe(200);
    const payload = (await second.json()) as {
      duplicate: boolean;
      processed: boolean;
    };

    expect(payload.duplicate).toBe(true);
    expect(payload.processed).toBe(true);
    expect(prismaMock.getOrderCount()).toBe(1);
    expect(prismaMock.getProductStock('product_webhook_1')).toBe(4);
    expect(prismaMock.getCartItemCount('cart_webhook_1')).toBe(0);
  });

  it('handles terminal expired outcome without creating a duplicate order', async () => {
    stripeMock.seedSession({
      id: 'cs_webhook_1',
      status: 'expired',
      payment_status: 'unpaid',
      url: 'https://checkout.stripe.test/pay/cs_webhook_1',
    });

    const event = buildCheckoutSessionEvent({
      eventId: 'evt_expired_terminal_1',
      eventType: 'checkout.session.expired',
      sessionId: 'cs_webhook_1',
    });

    const response = await postStripeWebhook(event);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { processed: boolean; duplicate: boolean };
    expect(payload.processed).toBe(true);
    expect(payload.duplicate).toBe(false);

    expect(prismaMock.getOrderCount()).toBe(0);
    expect(prismaMock.getProductStock('product_webhook_1')).toBe(5);
    expect(prismaMock.getCartItemCount('cart_webhook_1')).toBe(1);

    const storedEvent = prismaMock.getWebhookEvent('evt_expired_terminal_1');
    expect(storedEvent?.status).toBe(PaymentWebhookEventStatus.PROCESSED);
    expect(storedEvent?.orderId).toBeNull();
  });

  it('ignores stale terminal event and does not downgrade an already paid order', async () => {
    const existingOrder = prismaMock.seedPaidOrderForDefaultSession();
    expect(existingOrder).not.toBeNull();

    stripeMock.seedSession({
      id: 'cs_webhook_1',
      status: 'expired',
      payment_status: 'unpaid',
      url: 'https://checkout.stripe.test/pay/cs_webhook_1',
    });

    const event = buildCheckoutSessionEvent({
      eventId: 'evt_stale_terminal_1',
      eventType: 'checkout.session.expired',
      sessionId: 'cs_webhook_1',
    });

    const response = await postStripeWebhook(event);
    expect(response.status).toBe(200);

    const orderAfter = prismaMock.getOrderByCheckoutSessionId('checkout_session_webhook_1');
    expect(orderAfter?.status).toBe(PrismaOrderStatus.PAID);
    expect(orderAfter?.cancelledAt).toBeNull();

    const storedEvent = prismaMock.getWebhookEvent('evt_stale_terminal_1');
    expect(storedEvent?.status).toBe(PaymentWebhookEventStatus.PROCESSED);
  });

  it('rejects invalid signature and returns bad request', async () => {
    const event = buildCheckoutSessionEvent({
      eventId: 'evt_invalid_signature_1',
      eventType: 'checkout.session.completed',
      sessionId: 'cs_webhook_1',
    });

    const response = await postStripeWebhook(event, 'v1=bad_signature');
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('WEBHOOK_SIGNATURE_INVALID');
    expect(prismaMock.getWebhookEvent('evt_invalid_signature_1')).toBeNull();
  });

  it('returns retryable failure when provider session is not linked locally yet', async () => {
    stripeMock.seedSession({
      id: 'cs_missing_local_session_1',
      status: 'complete',
      payment_status: 'paid',
      url: 'https://checkout.stripe.test/pay/cs_missing_local_session_1',
    });

    const event = buildCheckoutSessionEvent({
      eventId: 'evt_missing_session_retry_1',
      eventType: 'checkout.session.completed',
      sessionId: 'cs_missing_local_session_1',
    });

    const response = await postStripeWebhook(event);
    expect(response.status).toBe(500);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('WEBHOOK_PROCESSING_FAILED');

    const storedEvent = prismaMock.getWebhookEvent('evt_missing_session_retry_1');
    expect(storedEvent?.status).toBe(PaymentWebhookEventStatus.FAILED);
  });
});
