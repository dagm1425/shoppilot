import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
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

type MockCart = { id: string; userId: string; createdAt: Date; updatedAt: Date };
type MockCartItem = {
  id: string;
  cartId: string;
  productId: string;
  size: 'S' | 'M' | 'L' | 'XL';
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
  cartSnapshot: unknown;
  blockingReasons: unknown;
  priceValidatedAt: Date;
  pricingSnapshotId: string | null;
  paymentProviderSessionId: string | null;
  expiresAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type MockStripeSession = {
  id: string;
  status: 'open' | 'complete' | 'expired';
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  url: string;
};

class InMemoryStripeCheckoutProvider {
  readonly createdInputs: Array<Record<string, unknown>> = [];
  private sessions = new Map<string, MockStripeSession>();

  reset() {
    this.createdInputs.length = 0;
    this.sessions.clear();
  }

  seedSession(session: MockStripeSession) {
    this.sessions.set(session.id, session);
  }

  async createHostedSession(input: Record<string, unknown>) {
    this.createdInputs.push(input);
    const id = `cs_test_${this.createdInputs.length}`;
    const created: MockStripeSession = {
      id,
      status: 'open',
      payment_status: 'unpaid',
      url: `https://checkout.stripe.test/pay/${id}`,
    };
    this.sessions.set(id, created);
    return created;
  }

  async retrieveSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Stripe session not found: ${sessionId}`);
    }
    return session;
  }
}

class InMemoryCheckoutPrisma {
  private idCounter = 0;
  private users = new Map<string, MockUser>();
  private usersByEmail = new Map<string, string>();
  private products = new Map<string, MockProduct>();
  private carts = new Map<string, MockCart>();
  private cartsByUser = new Map<string, string>();
  private cartItems = new Map<string, MockCartItem>();
  private addresses = new Map<string, MockAddress>();
  private sessions = new Map<string, MockCheckoutSession>();

  reset() {
    this.idCounter = 100;
    this.users.clear();
    this.usersByEmail.clear();
    this.products.clear();
    this.carts.clear();
    this.cartsByUser.clear();
    this.cartItems.clear();
    this.addresses.clear();
    this.sessions.clear();

    const userA: MockUser = {
      id: 'user_checkout',
      username: 'checkout_user',
      email: 'checkout@shoppilot.local',
      role: Role.CUSTOMER,
      sessionVersion: 0,
    };

    const userB: MockUser = {
      id: 'user_empty',
      username: 'empty_user',
      email: 'empty@shoppilot.local',
      role: Role.CUSTOMER,
      sessionVersion: 0,
    };

    this.users.set(userA.id, userA);
    this.usersByEmail.set(userA.email, userA.id);
    this.users.set(userB.id, userB);
    this.usersByEmail.set(userB.email, userB.id);

    const product: MockProduct = {
      id: 'product_1',
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
    const cart: MockCart = { id: 'cart_1', userId: userA.id, createdAt: now, updatedAt: now };
    this.carts.set(cart.id, cart);
    this.cartsByUser.set(userA.id, cart.id);

    const cartItem: MockCartItem = {
      id: 'item_1',
      cartId: cart.id,
      productId: product.id,
      size: 'M',
      quantity: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.cartItems.set(cartItem.id, cartItem);
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

  expireSession(token: string) {
    for (const session of this.sessions.values()) {
      if (session.token === token) {
        session.expiresAt = new Date(Date.now() - 1_000);
        session.updatedAt = new Date();
        this.sessions.set(session.id, session);
        return;
      }
    }

    throw new Error('Session token not found');
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

  readonly cart = {
    upsert: async (args: {
      where: { userId: string };
      create: { userId: string };
      update: Record<string, never>;
      include?: { items?: { include?: { product?: true }; orderBy?: { createdAt?: 'asc' | 'desc' } } };
    }) => {
      let cartId = this.cartsByUser.get(args.where.userId);
      if (!cartId) {
        cartId = this.nextId('cart');
        const created = { id: cartId, userId: args.create.userId, createdAt: new Date(), updatedAt: new Date() };
        this.carts.set(cartId, created);
        this.cartsByUser.set(args.create.userId, cartId);
      }

      const cart = this.carts.get(cartId);
      if (!cart) {
        throw new Error('Cart missing');
      }

      if (!args.include?.items) {
        return { ...cart };
      }

      const items = [...this.cartItems.values()]
        .filter((item) => item.cartId === cart.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((item) => {
          const product = this.products.get(item.productId);
          if (!product) {
            throw new Error('Product missing');
          }

          return {
            ...item,
            product: { ...product },
          };
        });

      return {
        ...cart,
        items,
      };
    },
  };

  readonly address = {
    findMany: async (args: { where: { userId: string }; orderBy?: Array<{ isDefault?: 'asc' | 'desc'; createdAt?: 'asc' | 'desc' }> }) => {
      const records = [...this.addresses.values()].filter((entry) => entry.userId === args.where.userId);
      records.sort((a, b) => {
        if (a.isDefault !== b.isDefault) {
          return a.isDefault ? -1 : 1;
        }

        return a.createdAt.getTime() - b.createdAt.getTime();
      });
      return records.map((entry) => ({ ...entry }));
    },

    count: async (args: { where: { userId: string } }) => {
      return [...this.addresses.values()].filter((entry) => entry.userId === args.where.userId).length;
    },

    updateMany: async (args: { where: { userId: string }; data: { isDefault: boolean } }) => {
      let count = 0;
      for (const entry of this.addresses.values()) {
        if (entry.userId !== args.where.userId) {
          continue;
        }
        entry.isDefault = args.data.isDefault;
        entry.updatedAt = new Date();
        this.addresses.set(entry.id, entry);
        count += 1;
      }
      return { count };
    },

    create: async (args: { data: Omit<MockAddress, 'id' | 'createdAt' | 'updatedAt'> }) => {
      const now = new Date();
      const created: MockAddress = {
        id: this.nextId('address'),
        ...args.data,
        createdAt: now,
        updatedAt: now,
      };
      this.addresses.set(created.id, created);
      return { ...created };
    },

    findFirst: async (args: {
      where: { id?: string | { not: string }; userId?: string; isDefault?: boolean };
      orderBy?: { createdAt?: 'asc' | 'desc'; updatedAt?: 'asc' | 'desc' };
    }) => {
      let records = [...this.addresses.values()];
      if (typeof args.where.userId === 'string') {
        records = records.filter((entry) => entry.userId === args.where.userId);
      }
      const idValue = args.where.id;
      if (typeof idValue === 'string') {
        records = records.filter((entry) => entry.id === idValue);
      } else if (idValue && typeof idValue === 'object' && 'not' in idValue) {
        records = records.filter((entry) => entry.id !== idValue.not);
      }
      if (typeof args.where.isDefault === 'boolean') {
        records = records.filter((entry) => entry.isDefault === args.where.isDefault);
      }
      if (args.orderBy?.updatedAt === 'desc') {
        records.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      } else {
        records.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      }
      return records.length > 0 ? { ...records[0] } : null;
    },

    update: async (args: { where: { id: string }; data: Partial<MockAddress> }) => {
      const existing = this.addresses.get(args.where.id);
      if (!existing) {
        throw new Error('Address not found');
      }
      const updated: MockAddress = {
        ...existing,
        ...args.data,
        updatedAt: new Date(),
      };
      this.addresses.set(updated.id, updated);
      return { ...updated };
    },

    delete: async (args: { where: { id: string } }) => {
      const existing = this.addresses.get(args.where.id);
      if (!existing) {
        throw new Error('Address not found');
      }
      this.addresses.delete(args.where.id);
      return { ...existing };
    },
  };

  readonly checkoutSession = {
    findFirst: async (args: {
      where: {
        token?: string;
        userId?: string;
        cartId?: string;
        paymentProviderSessionId?: string;
        isActive?: boolean;
        expiresAt?: { gt: Date };
      };
      orderBy?: { updatedAt?: 'asc' | 'desc' };
      include?: { selectedAddress?: true };
    }) => {
      let sessions = [...this.sessions.values()];
      if (args.where.userId) {
        sessions = sessions.filter((session) => session.userId === args.where.userId);
      }
      if (args.where.token) {
        sessions = sessions.filter((session) => session.token === args.where.token);
      }
      if (args.where.cartId) {
        sessions = sessions.filter((session) => session.cartId === args.where.cartId);
      }
      if (args.where.paymentProviderSessionId) {
        sessions = sessions.filter(
          (session) => session.paymentProviderSessionId === args.where.paymentProviderSessionId,
        );
      }
      if (typeof args.where.isActive === 'boolean') {
        sessions = sessions.filter((session) => session.isActive === args.where.isActive);
      }
      if (args.where.expiresAt?.gt) {
        const expiresAfter = args.where.expiresAt.gt.getTime();
        sessions = sessions.filter((session) => session.expiresAt.getTime() > expiresAfter);
      }
      if (args.orderBy?.updatedAt === 'desc') {
        sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      }

      const first = sessions[0];
      if (!first) {
        return null;
      }

      return this.attachSessionAddress(first);
    },

    update: async (args: { where: { id: string }; data: Partial<MockCheckoutSession>; include?: { selectedAddress?: true } }) => {
      const existing = this.sessions.get(args.where.id);
      if (!existing) {
        throw new Error('Session not found');
      }

      const updated: MockCheckoutSession = {
        ...existing,
        ...args.data,
        updatedAt: new Date(),
      };

      this.sessions.set(updated.id, updated);
      return this.attachSessionAddress(updated);
    },

    updateMany: async (args: {
      where: { userId: string; cartId?: string; isActive?: boolean };
      data: { isActive: boolean };
    }) => {
      let count = 0;
      for (const session of this.sessions.values()) {
        if (session.userId !== args.where.userId) {
          continue;
        }
        if (args.where.cartId && session.cartId !== args.where.cartId) {
          continue;
        }
        if (typeof args.where.isActive === 'boolean' && session.isActive !== args.where.isActive) {
          continue;
        }

        session.isActive = args.data.isActive;
        session.updatedAt = new Date();
        this.sessions.set(session.id, session);
        count += 1;
      }
      return { count };
    },

    create: async (args: {
      data: Omit<MockCheckoutSession, 'id' | 'createdAt' | 'updatedAt'>;
      include?: { selectedAddress?: true };
    }) => {
      const now = new Date();
      const created: MockCheckoutSession = {
        id: this.nextId('session'),
        ...args.data,
        pricingSnapshotId: args.data.pricingSnapshotId ?? null,
        paymentProviderSessionId: args.data.paymentProviderSessionId ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.sessions.set(created.id, created);
      return this.attachSessionAddress(created);
    },
  };

  async $transaction<T>(input: Array<Promise<T>> | ((tx: this) => Promise<T>)): Promise<T[] | T> {
    if (typeof input === 'function') {
      return input(this);
    }

    return Promise.all(input);
  }

  private attachSessionAddress(session: MockCheckoutSession) {
    const selectedAddress = session.selectedAddressId ? this.addresses.get(session.selectedAddressId) ?? null : null;
    return {
      ...session,
      selectedAddress,
    };
  }

  private nextId(prefix: string) {
    this.idCounter += 1;
    return `${prefix}_${this.idCounter}`;
  }
}

describe('Checkout foundations (integration)', () => {
  const prismaMock = new InMemoryCheckoutPrisma();
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

  it('creates blocked session, then becomes ready after address and contact are set', async () => {
    const cookie = await getAuthCookie('checkout@shoppilot.local');

    const sessionStart = await fetch(`${baseUrl}/checkout/session`, {
      method: 'POST',
      headers: { cookie },
    });

    expect(sessionStart.status).toBe(200);
    const startPayload = (await sessionStart.json()) as {
      sessionToken: string;
      readinessStatus: 'ready' | 'blocked';
      blockingReasons: Array<{ code: string }>;
    };

    expect(startPayload.readinessStatus).toBe('blocked');
    expect(startPayload.blockingReasons.map((entry) => entry.code)).toEqual([
      'ADDRESS_REQUIRED',
      'CONTACT_REQUIRED',
    ]);

    const addressCreate = await fetch(`${baseUrl}/me/addresses`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        recipientName: 'Dagmawi',
        country: 'ET',
        city: 'Addis Ababa',
        postalCode: '2000',
        line1: 'Yeka Sub-city',
        phone: '0900000000',
        isDefault: true,
      }),
    });

    expect(addressCreate.status).toBe(201);
    const addressPayload = (await addressCreate.json()) as { addressId: string };

    const setAddress = await fetch(`${baseUrl}/checkout/session/${startPayload.sessionToken}/address`, {
      method: 'PATCH',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ addressId: addressPayload.addressId }),
    });

    expect(setAddress.status).toBe(200);
    const setAddressPayload = (await setAddress.json()) as {
      readinessStatus: 'ready' | 'blocked';
      blockingReasons: Array<{ code: string }>;
    };
    expect(setAddressPayload.readinessStatus).toBe('blocked');
    expect(setAddressPayload.blockingReasons.map((entry) => entry.code)).toEqual(['CONTACT_REQUIRED']);

    const setContact = await fetch(`${baseUrl}/checkout/session/${startPayload.sessionToken}/contact`, {
      method: 'PATCH',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'checkout@shoppilot.local',
        phone: '0900000000',
      }),
    });

    expect(setContact.status).toBe(200);
    const setContactPayload = (await setContact.json()) as {
      readinessStatus: 'ready' | 'blocked';
      blockingReasons: Array<{ code: string }>;
      contact: { email: string | null; phone: string | null };
    };

    expect(setContactPayload.readinessStatus).toBe('ready');
    expect(setContactPayload.blockingReasons).toEqual([]);
    expect(setContactPayload.contact).toEqual({
      email: 'checkout@shoppilot.local',
      phone: '0900000000',
    });
  });

  it('blocks checkout session creation for empty cart', async () => {
    const cookie = await getAuthCookie('empty@shoppilot.local');

    const response = await fetch(`${baseUrl}/checkout/session`, {
      method: 'POST',
      headers: { cookie },
    });

    expect(response.status).toBe(409);
    const payload = (await response.json()) as {
      error: { code: string };
    };
    expect(payload.error.code).toBe('CHECKOUT_CART_EMPTY');
  });

  it('resumes active session and expires stale session token', async () => {
    const cookie = await getAuthCookie('checkout@shoppilot.local');

    await fetch(`${baseUrl}/me/addresses`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        recipientName: 'Default User',
        country: 'ET',
        city: 'Addis',
        postalCode: '2000',
        line1: 'Bole',
        phone: '0900000000',
        isDefault: true,
      }),
    });

    const startResponse = await fetch(`${baseUrl}/checkout/session`, {
      method: 'POST',
      headers: { cookie },
    });
    const startPayload = (await startResponse.json()) as { sessionToken: string };

    const resumeResponse = await fetch(`${baseUrl}/checkout/session`, {
      method: 'POST',
      headers: { cookie },
    });
    const resumePayload = (await resumeResponse.json()) as { sessionToken: string };

    expect(resumePayload.sessionToken).toBe(startPayload.sessionToken);

    prismaMock.expireSession(startPayload.sessionToken);

    const expiredRead = await fetch(`${baseUrl}/checkout/session/${startPayload.sessionToken}`, {
      method: 'GET',
      headers: { cookie },
    });

    expect(expiredRead.status).toBe(410);
    const expiredPayload = (await expiredRead.json()) as { error: { code: string } };
    expect(expiredPayload.error.code).toBe('CHECKOUT_SESSION_EXPIRED');
  });

  it('returns pricing breakdown with ET default tax and fixed shipping', async () => {
    const cookie = await getAuthCookie('checkout@shoppilot.local');

    await fetch(`${baseUrl}/me/addresses`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        recipientName: 'Tax Default',
        country: 'ET',
        city: 'Addis',
        postalCode: '2000',
        line1: 'Bole',
        phone: '0900000000',
        isDefault: true,
      }),
    });

    const response = await fetch(`${baseUrl}/checkout/session`, {
      method: 'POST',
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      pricing: {
        subtotalCents: number;
        shippingCents: number;
        taxRate: number;
        taxCents: number;
        totalCents: number;
      };
    };

    expect(payload.pricing.subtotalCents).toBe(5200);
    expect(payload.pricing.shippingCents).toBe(500);
    expect(payload.pricing.taxRate).toBeCloseTo(0.0425, 4);
    expect(payload.pricing.taxCents).toBe(242);
    expect(payload.pricing.totalCents).toBe(5942);
  });

  it('creates payment session for ready checkout and reuses open provider session on retry', async () => {
    const cookie = await getAuthCookie('checkout@shoppilot.local');

    const addressCreate = await fetch(`${baseUrl}/me/addresses`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        recipientName: 'Ready User',
        country: 'US',
        city: 'Austin',
        postalCode: '73301',
        line1: 'Congress Ave',
        phone: '0900000000',
        isDefault: true,
      }),
    });
    const addressPayload = (await addressCreate.json()) as { addressId: string };

    const sessionStart = await fetch(`${baseUrl}/checkout/session`, {
      method: 'POST',
      headers: { cookie },
    });
    const startPayload = (await sessionStart.json()) as { sessionToken: string };

    await fetch(`${baseUrl}/checkout/session/${startPayload.sessionToken}/address`, {
      method: 'PATCH',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ addressId: addressPayload.addressId }),
    });

    await fetch(`${baseUrl}/checkout/session/${startPayload.sessionToken}/contact`, {
      method: 'PATCH',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'checkout@shoppilot.local',
        phone: '0900000000',
      }),
    });

    const createPayment = await fetch(
      `${baseUrl}/checkout/session/${startPayload.sessionToken}/payment`,
      {
        method: 'POST',
        headers: { cookie },
      },
    );

    expect(createPayment.status).toBe(200);
    const paymentPayload = (await createPayment.json()) as {
      provider: string;
      providerSessionId: string;
      checkoutUrl: string;
    };
    expect(paymentPayload.provider).toBe('stripe');
    expect(paymentPayload.providerSessionId).toContain('cs_test_');
    expect(paymentPayload.checkoutUrl).toContain('checkout.stripe.test');
    expect(stripeMock.createdInputs).toHaveLength(1);

    const retryPayment = await fetch(
      `${baseUrl}/checkout/session/${startPayload.sessionToken}/payment`,
      {
        method: 'POST',
        headers: { cookie },
      },
    );
    const retryPayload = (await retryPayment.json()) as { providerSessionId: string };
    expect(retryPayment.status).toBe(200);
    expect(retryPayload.providerSessionId).toBe(paymentPayload.providerSessionId);
    expect(stripeMock.createdInputs).toHaveLength(1);
  });

  it('maps Stripe payment status to normalized checkout payment status for open session', async () => {
    const cookie = await getAuthCookie('checkout@shoppilot.local');

    const addressCreate = await fetch(`${baseUrl}/me/addresses`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        recipientName: 'Status User',
        country: 'CA',
        city: 'Toronto',
        postalCode: 'M5V',
        line1: 'King St',
        phone: '0900000000',
        isDefault: true,
      }),
    });
    const addressPayload = (await addressCreate.json()) as { addressId: string };

    const sessionStart = await fetch(`${baseUrl}/checkout/session`, {
      method: 'POST',
      headers: { cookie },
    });
    const startPayload = (await sessionStart.json()) as { sessionToken: string };

    await fetch(`${baseUrl}/checkout/session/${startPayload.sessionToken}/address`, {
      method: 'PATCH',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ addressId: addressPayload.addressId }),
    });

    await fetch(`${baseUrl}/checkout/session/${startPayload.sessionToken}/contact`, {
      method: 'PATCH',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'checkout@shoppilot.local',
        phone: '0900000000',
      }),
    });

    const createPayment = await fetch(
      `${baseUrl}/checkout/session/${startPayload.sessionToken}/payment`,
      {
        method: 'POST',
        headers: { cookie },
      },
    );
    const paymentPayload = (await createPayment.json()) as { providerSessionId: string };

    stripeMock.seedSession({
      id: paymentPayload.providerSessionId,
      status: 'open',
      payment_status: 'unpaid',
      url: `https://checkout.stripe.test/pay/${paymentPayload.providerSessionId}`,
    });

    const statusResponse = await fetch(
      `${baseUrl}/checkout/session/${startPayload.sessionToken}/payment-status?providerSessionId=${paymentPayload.providerSessionId}`,
      {
        method: 'GET',
        headers: { cookie },
      },
    );

    expect(statusResponse.status).toBe(200);
    const statusPayload = (await statusResponse.json()) as { status: string };
    expect(statusPayload.status).toBe('open');
  });
});
