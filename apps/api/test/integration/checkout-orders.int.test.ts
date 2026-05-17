import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ProductSize, Role, type OrderStatus as PrismaOrderStatus } from '@prisma/client';
import { parseEnv } from '../../src/config/env.js';
import { createTestApp } from '../helpers/test-app.js';

const env = parseEnv(process.env);

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

type CheckoutSessionUpdateManyArgs = {
  where?: {
    userId?: string;
    cartId?: string;
    isActive?: boolean;
  };
  data: {
    isActive: boolean;
  };
};

type ProductUpdateManyArgs = {
  where: {
    id: string;
    available?: boolean;
    stock?: { gte?: number };
  };
  data: {
    stock?: { decrement?: number };
  };
};

type CartItemDeleteManyArgs = {
  where: {
    cartId: string;
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

type OrderFindFirstArgs = {
  where?: {
    userId?: string;
    orderNumber?: string;
  };
};

class InMemoryStripeCheckoutProvider {
  private sessions = new Map<string, MockStripeSession>();

  reset() {
    this.sessions.clear();
    this.seedSession({
      id: 'cs_paid_1',
      status: 'complete',
      payment_status: 'paid',
      url: 'https://checkout.stripe.test/pay/cs_paid_1',
    });
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
}

class InMemoryCheckoutOrdersPrisma {
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
  private failNextStockUpdate = false;

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
    this.failNextStockUpdate = false;

    const checkoutUser: MockUser = {
      id: 'user_checkout',
      username: 'checkout_user',
      email: 'checkout@shoppilot.local',
      role: Role.CUSTOMER,
      sessionVersion: 0,
    };
    const otherUser: MockUser = {
      id: 'user_other',
      username: 'other_user',
      email: 'other@shoppilot.local',
      role: Role.CUSTOMER,
      sessionVersion: 0,
    };

    this.users.set(checkoutUser.id, checkoutUser);
    this.usersByEmail.set(checkoutUser.email, checkoutUser.id);
    this.users.set(otherUser.id, otherUser);
    this.usersByEmail.set(otherUser.email, otherUser.id);

    const product: MockProduct = {
      id: 'product_order_1',
      slug: 'everyday-training-short',
      name: 'Everyday Training Short',
      fit: 'Regular fit',
      color: 'Black',
      priceCents: 5200,
      currency: 'USD',
      available: true,
      stock: 5,
      primaryImageUrl: 'https://example.com/short-a.jpg',
      secondaryImageUrl: null,
    };
    this.products.set(product.id, product);

    const now = new Date();
    const cart: MockCart = {
      id: 'cart_order_1',
      userId: checkoutUser.id,
      createdAt: now,
      updatedAt: now,
    };
    this.carts.set(cart.id, cart);

    const cartItem: MockCartItem = {
      id: 'cart_item_1',
      cartId: cart.id,
      productId: product.id,
      size: ProductSize.M,
      quantity: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.cartItems.set(cartItem.id, cartItem);

    const address: MockAddress = {
      id: 'address_order_1',
      userId: checkoutUser.id,
      recipientName: 'Dagmawi',
      country: 'ET',
      city: 'Addis Ababa',
      postalCode: '2000',
      line1: 'Yeka Sub-city',
      line2: null,
      phone: '0900000000',
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    };
    this.addresses.set(address.id, address);

    const session: MockCheckoutSession = {
      id: 'checkout_session_order_1',
      token: 'checkout_token_order_1',
      userId: checkoutUser.id,
      cartId: cart.id,
      selectedAddressId: address.id,
      contactEmail: checkoutUser.email,
      contactPhone: '0900000000',
      blockingReasons: [],
      cartSnapshot: {},
      priceValidatedAt: now,
      pricingSnapshotId: 'pricing_1',
      paymentProviderSessionId: 'cs_paid_1',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, session);
  }

  getUserByEmail(email: string): MockUser {
    const userId = this.usersByEmail.get(email);
    if (!userId) {
      throw new Error(`Unknown user for email: ${email}`);
    }
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`Unknown user id: ${userId}`);
    }
    return { ...user };
  }

  getProductStock(productId: string): number {
    const product = this.products.get(productId);
    if (!product) {
      throw new Error(`Unknown product: ${productId}`);
    }
    return product.stock;
  }

  getCartItemCount(cartId: string): number {
    return [...this.cartItems.values()].filter((item) => item.cartId === cartId).length;
  }

  getSessionByToken(token: string): MockCheckoutSession | null {
    for (const session of this.sessions.values()) {
      if (session.token === token) {
        return { ...session };
      }
    }
    return null;
  }

  getOrderCount(): number {
    return this.orders.size;
  }

  forceNextStockUpdateFailure() {
    this.failNextStockUpdate = true;
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
      if (where.expiresAt?.gt instanceof Date) {
        const gt = where.expiresAt.gt.getTime();
        sessions = sessions.filter((session) => session.expiresAt.getTime() > gt);
      }
      if (args.orderBy?.updatedAt === 'desc') {
        sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      }

      const first = sessions[0];
      if (!first) {
        return null;
      }

      return this.attachCheckoutSessionRelations(first, args.include);
    },

    updateMany: async (args: CheckoutSessionUpdateManyArgs) => {
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
    updateMany: async (args: ProductUpdateManyArgs) => {
      if (this.failNextStockUpdate) {
        this.failNextStockUpdate = false;
        return { count: 0 };
      }

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
    deleteMany: async (args: CartItemDeleteManyArgs) => {
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

    findFirst: async (args: OrderFindFirstArgs) => {
      const where = args.where ?? {};
      let orders = [...this.orders.values()];
      if (where.userId) {
        orders = orders.filter((order) => order.userId === where.userId);
      }
      if (where.orderNumber) {
        orders = orders.filter((order) => order.orderNumber === where.orderNumber);
      }

      const found = orders[0];
      if (!found) {
        return null;
      }

      const items = [...this.orderItems.values()]
        .filter((item) => item.orderId === found.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((item) => ({ ...item }));

      return {
        ...found,
        items,
      };
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
        throw new Error(`Cart not found for session ${session.id}`);
      }

      const items = [...this.cartItems.values()]
        .filter((item) => item.cartId === cart.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((item) => {
          const product = this.products.get(item.productId);
          if (!product) {
            throw new Error(`Product not found for cart item ${item.id}`);
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
      const order = [...this.orders.values()].find(
        (entry) => entry.checkoutSessionId === session.id,
      );

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

describe('Checkout orders (integration)', () => {
  const prismaMock = new InMemoryCheckoutOrdersPrisma();
  const stripeMock = new InMemoryStripeCheckoutProvider();

  let app: INestApplication;
  let baseUrl = '';
  let jwtService: JwtService;

  beforeAll(async () => {
    prismaMock.reset();
    stripeMock.reset();
    app = await createTestApp({
      prismaService: prismaMock as never,
      stripeCheckoutProvider: stripeMock as never,
    });

    jwtService = app.get(JwtService);

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

  async function getAuthCookie(email: string): Promise<string> {
    const user = prismaMock.getUserByEmail(email);
    const token = await jwtService.signAsync({
      sub: user.id,
      role: user.role,
      sessionVersion: user.sessionVersion,
    });

    return `${env.AUTH_COOKIE_NAME}=${token}`;
  }

  it('places order, clears cart, decrements stock, and returns idempotent replay response', async () => {
    const cookie = await getAuthCookie('checkout@shoppilot.local');

    const response = await fetch(`${baseUrl}/checkout/place-order`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        checkoutSessionToken: 'checkout_token_order_1',
        idempotencyKey: 'order:checkout_token_order_1:cs_paid_1',
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      orderId: string;
      orderNumber: string;
      status: string;
      statusTimestamps: { paidAt: string | null };
      items: Array<{ quantity: number }>;
    };

    expect(payload.orderNumber).toMatch(/^SP-\d{8}-[A-Z0-9]{6}$/);
    expect(payload.status).toBe('paid');
    expect(payload.statusTimestamps.paidAt).not.toBeNull();
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]?.quantity).toBe(1);
    expect(prismaMock.getProductStock('product_order_1')).toBe(4);
    expect(prismaMock.getCartItemCount('cart_order_1')).toBe(0);
    expect(prismaMock.getSessionByToken('checkout_token_order_1')?.isActive).toBe(false);

    const replay = await fetch(`${baseUrl}/checkout/place-order`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        checkoutSessionToken: 'checkout_token_order_1',
        idempotencyKey: 'order:checkout_token_order_1:cs_paid_1',
      }),
    });

    expect(replay.status).toBe(200);
    const replayPayload = (await replay.json()) as { orderId: string; orderNumber: string };
    expect(replayPayload.orderId).toBe(payload.orderId);
    expect(replayPayload.orderNumber).toBe(payload.orderNumber);
    expect(prismaMock.getProductStock('product_order_1')).toBe(4);
  });

  it('rejects idempotency key mismatch when order already exists', async () => {
    const cookie = await getAuthCookie('checkout@shoppilot.local');

    await fetch(`${baseUrl}/checkout/place-order`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        checkoutSessionToken: 'checkout_token_order_1',
        idempotencyKey: 'order:checkout_token_order_1:cs_paid_1',
      }),
    });

    const replayMismatch = await fetch(`${baseUrl}/checkout/place-order`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        checkoutSessionToken: 'checkout_token_order_1',
        idempotencyKey: 'order:checkout_token_order_1:cs_paid_1:retry',
      }),
    });

    expect(replayMismatch.status).toBe(409);
    const payload = (await replayMismatch.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('ORDER_IDEMPOTENCY_KEY_MISMATCH');
  });

  it('fails order creation when transactional stock revalidation fails', async () => {
    const cookie = await getAuthCookie('checkout@shoppilot.local');
    prismaMock.forceNextStockUpdateFailure();

    const response = await fetch(`${baseUrl}/checkout/place-order`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        checkoutSessionToken: 'checkout_token_order_1',
        idempotencyKey: 'order:checkout_token_order_1:cs_paid_1',
      }),
    });

    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('CHECKOUT_STOCK_REVALIDATION_FAILED');
    expect(prismaMock.getOrderCount()).toBe(0);
    expect(prismaMock.getProductStock('product_order_1')).toBe(5);
  });

  it('returns order by number for owner and hides it from another user', async () => {
    const ownerCookie = await getAuthCookie('checkout@shoppilot.local');
    const otherCookie = await getAuthCookie('other@shoppilot.local');

    const placeResponse = await fetch(`${baseUrl}/checkout/place-order`, {
      method: 'POST',
      headers: {
        cookie: ownerCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        checkoutSessionToken: 'checkout_token_order_1',
        idempotencyKey: 'order:checkout_token_order_1:cs_paid_1',
      }),
    });

    const placedOrder = (await placeResponse.json()) as { orderNumber: string };

    const ownerRead = await fetch(`${baseUrl}/orders/${placedOrder.orderNumber}`, {
      method: 'GET',
      headers: { cookie: ownerCookie },
    });

    expect(ownerRead.status).toBe(200);
    const ownerPayload = (await ownerRead.json()) as { orderNumber: string; items: unknown[] };
    expect(ownerPayload.orderNumber).toBe(placedOrder.orderNumber);
    expect(ownerPayload.items).toHaveLength(1);

    const otherRead = await fetch(`${baseUrl}/orders/${placedOrder.orderNumber}`, {
      method: 'GET',
      headers: { cookie: otherCookie },
    });

    expect(otherRead.status).toBe(404);
    const otherPayload = (await otherRead.json()) as { error: { code: string } };
    expect(otherPayload.error.code).toBe('ORDER_NOT_FOUND');
  });
});
