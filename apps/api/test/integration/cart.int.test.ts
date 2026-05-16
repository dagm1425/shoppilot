import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { parseEnv } from '../../src/config/env.js';
import { createTestApp } from '../helpers/test-app.js';

const env = parseEnv(process.env);

type CartErrorResponse = {
  error: {
    code: string;
    message: string;
    traceId: string;
  };
};

type MockUser = {
  id: string;
  username: string | null;
  email: string;
  role: Role;
  sessionVersion: number;
  createdAt: Date;
  updatedAt: Date;
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
  size: 'S' | 'M' | 'L' | 'XL';
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
};

class InMemoryCartPrisma {
  private idCounter = 0;
  private users = new Map<string, MockUser>();
  private usersByEmail = new Map<string, string>();
  private products = new Map<string, MockProduct>();
  private productsBySlug = new Map<string, string>();
  private carts = new Map<string, MockCart>();
  private cartsByUser = new Map<string, string>();
  private cartItems = new Map<string, MockCartItem>();

  reset(): void {
    this.idCounter = 0;
    this.users.clear();
    this.usersByEmail.clear();
    this.products.clear();
    this.productsBySlug.clear();
    this.carts.clear();
    this.cartsByUser.clear();
    this.cartItems.clear();

    const now = new Date();

    const customer: MockUser = {
      id: 'user_customer',
      username: 'customer_1',
      email: 'customer@shoppilot.local',
      role: Role.CUSTOMER,
      sessionVersion: 0,
      createdAt: now,
      updatedAt: now,
    };

    const otherCustomer: MockUser = {
      id: 'user_customer_2',
      username: 'customer_2',
      email: 'customer-two@shoppilot.local',
      role: Role.CUSTOMER,
      sessionVersion: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(customer.id, customer);
    this.usersByEmail.set(customer.email, customer.id);
    this.users.set(otherCustomer.id, otherCustomer);
    this.usersByEmail.set(otherCustomer.email, otherCustomer.id);

    this.seedProduct({
      id: 'product_1',
      slug: 'arrival-oversized-tank',
      name: 'Arrival Oversized Tank',
      fit: 'Oversized fit',
      color: 'Force Blue',
      priceCents: 3000,
      currency: 'USD',
      available: true,
      stock: 5,
      primaryImageUrl: 'https://example.com/arrival-a.jpg',
      secondaryImageUrl: 'https://example.com/arrival-b.jpg',
    });

    this.seedProduct({
      id: 'product_2',
      slug: 'essential-cropped-tee',
      name: 'Essential Cropped Tee',
      fit: 'Relaxed fit',
      color: 'White',
      priceCents: 2400,
      currency: 'USD',
      available: true,
      stock: 4,
      primaryImageUrl: 'https://example.com/tee-a.jpg',
      secondaryImageUrl: 'https://example.com/tee-b.jpg',
    });

    this.seedProduct({
      id: 'product_3',
      slug: 'power-hoodie',
      name: 'Power Hoodie',
      fit: 'Regular fit',
      color: 'Black',
      priceCents: 6000,
      currency: 'USD',
      available: false,
      stock: 0,
      primaryImageUrl: 'https://example.com/hoodie-a.jpg',
      secondaryImageUrl: 'https://example.com/hoodie-b.jpg',
    });
  }

  getUserByEmail(email: string): MockUser {
    const userId = this.usersByEmail.get(email);
    if (!userId) {
      throw new Error(`Unknown user for email ${email}`);
    }

    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`Unknown user id ${userId}`);
    }

    return { ...user };
  }

  setProductAvailability(slug: string, available: boolean, stock: number): void {
    const productId = this.productsBySlug.get(slug);
    if (!productId) {
      throw new Error(`Unknown product slug ${slug}`);
    }

    const product = this.products.get(productId);
    if (!product) {
      throw new Error(`Unknown product id ${productId}`);
    }

    product.available = available;
    product.stock = stock;
    this.products.set(product.id, product);
  }

  readonly user = {
    findUnique: async (args: {
      where: { id?: string; email?: string; username?: string | null };
      select?: {
        id?: boolean;
        username?: boolean;
        email?: boolean;
        role?: boolean;
        sessionVersion?: boolean;
      };
    }) => {
      const userId = args.where.id ?? this.usersByEmail.get(args.where.email ?? '');
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

  readonly product = {
    findUnique: async (args: { where: { id?: string; slug?: string } }) => {
      const productId = args.where.id ?? this.productsBySlug.get(args.where.slug ?? '');
      if (!productId) {
        return null;
      }

      const product = this.products.get(productId);
      return product ? { ...product } : null;
    },
  };

  readonly cart = {
    upsert: async (args: {
      where: { userId: string };
      create: { userId: string };
      update: Record<string, never>;
      include?: {
        items?: {
          include?: { product?: boolean };
          orderBy?: { createdAt?: 'asc' | 'desc' };
        };
      };
    }) => {
      const existingCartId = this.cartsByUser.get(args.where.userId);
      let cart: MockCart;

      if (existingCartId) {
        const existing = this.carts.get(existingCartId);
        if (!existing) {
          throw new Error('Cart reference missing');
        }

        cart = { ...existing, updatedAt: new Date() };
      } else {
        cart = {
          id: this.nextId('cart'),
          userId: args.create.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        this.cartsByUser.set(cart.userId, cart.id);
      }

      this.carts.set(cart.id, cart);

      if (!args.include?.items) {
        return { ...cart };
      }

      return {
        ...cart,
        items: this.listCartItems(cart.id),
      };
    },
  };

  readonly cartItem = {
    findFirst: async (args: {
      where: {
        id?: string;
        cart?: { userId: string };
      };
      include?: { product?: boolean };
    }) => {
      for (const item of this.cartItems.values()) {
        if (args.where.id && item.id !== args.where.id) {
          continue;
        }

        if (args.where.cart?.userId) {
          const cart = this.carts.get(item.cartId);
          if (!cart || cart.userId !== args.where.cart.userId) {
            continue;
          }
        }

        const product = this.products.get(item.productId);
        if (!product) {
          throw new Error('Product reference missing');
        }

        if (args.include?.product) {
          return {
            ...item,
            product: { ...product },
          };
        }

        return { ...item };
      }

      return null;
    },
    create: async (args: {
      data: { cartId: string; productId: string; size: 'S' | 'M' | 'L' | 'XL'; quantity: number };
    }) => {
      const item: MockCartItem = {
        id: this.nextId('item'),
        cartId: args.data.cartId,
        productId: args.data.productId,
        size: args.data.size,
        quantity: args.data.quantity,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.cartItems.set(item.id, item);
      return { ...item };
    },
    update: async (args: {
      where: { id: string };
      data: { quantity: number };
    }) => {
      const item = this.cartItems.get(args.where.id);
      if (!item) {
        throw new Error('Cart item not found');
      }

      item.quantity = args.data.quantity;
      item.updatedAt = new Date();
      this.cartItems.set(item.id, item);
      return { ...item };
    },
    deleteMany: async (args: {
      where: {
        id?: string;
        cart?: { userId: string };
      };
    }) => {
      let count = 0;

      for (const item of [...this.cartItems.values()]) {
        if (args.where.id && item.id !== args.where.id) {
          continue;
        }

        if (args.where.cart?.userId) {
          const cart = this.carts.get(item.cartId);
          if (!cart || cart.userId !== args.where.cart.userId) {
            continue;
          }
        }

        this.cartItems.delete(item.id);
        count += 1;
      }

      return { count };
    },
  };

  private listCartItems(cartId: string) {
    return [...this.cartItems.values()]
      .filter((item) => item.cartId === cartId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .map((item) => {
        const product = this.products.get(item.productId);
        if (!product) {
          throw new Error('Product reference missing');
        }

        return {
          ...item,
          product: { ...product },
        };
      });
  }

  private seedProduct(product: MockProduct): void {
    this.products.set(product.id, { ...product });
    this.productsBySlug.set(product.slug, product.id);
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}_${this.idCounter}`;
  }
}

describe('Cart API (integration)', () => {
  const prismaMock = new InMemoryCartPrisma();

  let app: INestApplication;
  let baseUrl = '';
  let jwtService: JwtService;

  beforeAll(async () => {
    prismaMock.reset();
    app = await createTestApp({
      prismaService: prismaMock as never,
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

  it('returns an empty cart for an authenticated user with no items', async () => {
    const cookie = await getAuthCookie('customer@shoppilot.local');

    const response = await fetch(`${baseUrl}/cart`, {
      headers: { cookie },
    });

    const payload = (await response.json()) as {
      items: unknown[];
      summary: {
        itemCount: number;
        validLineCount: number;
        subtotalCents: number;
        currency: string;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.items).toEqual([]);
    expect(payload.summary).toEqual({
      itemCount: 0,
      validLineCount: 0,
      subtotalCents: 0,
      currency: 'USD',
    });
  });

  it('adds cart items and increments quantity for an existing line', async () => {
    const cookie = await getAuthCookie('customer@shoppilot.local');

    const addFirst = await fetch(`${baseUrl}/cart/items`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        productId: 'arrival-oversized-tank',
        size: 'm',
        quantity: 2,
      }),
    });

    expect(addFirst.status).toBe(201);

    const addSecond = await fetch(`${baseUrl}/cart/items`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        productId: 'arrival-oversized-tank',
        size: 'm',
        quantity: 1,
      }),
    });

    const payload = (await addSecond.json()) as {
      items: Array<{ productId: string; size: string; quantity: number }>;
      summary: {
        itemCount: number;
        validLineCount: number;
        subtotalCents: number;
      };
    };

    expect(addSecond.status).toBe(201);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      productId: 'arrival-oversized-tank',
      size: 'm',
      quantity: 3,
    });
    expect(payload.summary).toMatchObject({
      itemCount: 3,
      validLineCount: 1,
      subtotalCents: 9000,
    });
  });

  it('creates separate cart lines for different sizes of the same product', async () => {
    const cookie = await getAuthCookie('customer@shoppilot.local');

    await fetch(`${baseUrl}/cart/items`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        productId: 'arrival-oversized-tank',
        size: 'm',
        quantity: 1,
      }),
    });

    const addSecond = await fetch(`${baseUrl}/cart/items`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        productId: 'arrival-oversized-tank',
        size: 'l',
        quantity: 1,
      }),
    });

    const payload = (await addSecond.json()) as {
      items: Array<{ productId: string; size: string; quantity: number }>;
      summary: {
        itemCount: number;
        validLineCount: number;
      };
    };

    expect(addSecond.status).toBe(201);
    expect(payload.items).toHaveLength(2);
    expect(payload.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: 'arrival-oversized-tank', size: 'm', quantity: 1 }),
        expect.objectContaining({ productId: 'arrival-oversized-tank', size: 'l', quantity: 1 }),
      ]),
    );
    expect(payload.summary).toMatchObject({
      itemCount: 2,
      validLineCount: 2,
    });
  });

  it('rejects quantity updates above stock bounds', async () => {
    const cookie = await getAuthCookie('customer@shoppilot.local');

    const addResponse = await fetch(`${baseUrl}/cart/items`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        productId: 'arrival-oversized-tank',
        size: 'm',
        quantity: 1,
      }),
    });

    const addPayload = (await addResponse.json()) as {
      items: Array<{ itemId: string }>;
    };

    const lineItemId = addPayload.items[0]?.itemId;
    if (!lineItemId) {
      throw new Error('Expected cart item id after add request.');
    }

    const updateResponse = await fetch(`${baseUrl}/cart/items/${lineItemId}`, {
      method: 'PATCH',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ quantity: 99 }),
    });

    const updatePayload = (await updateResponse.json()) as CartErrorResponse;

    expect(updateResponse.status).toBe(409);
    expect(updatePayload.error.code).toBe('CART_STOCK_EXCEEDED');
  });

  it('removes items and treats repeated deletes as idempotent', async () => {
    const cookie = await getAuthCookie('customer@shoppilot.local');

    const addResponse = await fetch(`${baseUrl}/cart/items`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        productId: 'essential-cropped-tee',
        size: 'm',
        quantity: 1,
      }),
    });

    const addPayload = (await addResponse.json()) as {
      items: Array<{ itemId: string }>;
    };

    const itemId = addPayload.items[0]?.itemId;
    if (!itemId) {
      throw new Error('Expected cart item id after add request.');
    }

    const removeFirst = await fetch(`${baseUrl}/cart/items/${itemId}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    const removeFirstPayload = (await removeFirst.json()) as {
      items: unknown[];
      summary: { itemCount: number };
    };

    expect(removeFirst.status).toBe(200);
    expect(removeFirstPayload.items).toEqual([]);
    expect(removeFirstPayload.summary.itemCount).toBe(0);

    const removeSecond = await fetch(`${baseUrl}/cart/items/${itemId}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    const removeSecondPayload = (await removeSecond.json()) as {
      items: unknown[];
      summary: { itemCount: number };
    };

    expect(removeSecond.status).toBe(200);
    expect(removeSecondPayload.items).toEqual([]);
    expect(removeSecondPayload.summary.itemCount).toBe(0);
  });

  it('isolates cart state across users and blocks cross-user updates', async () => {
    const customerCookie = await getAuthCookie('customer@shoppilot.local');
    const otherCustomerCookie = await getAuthCookie('customer-two@shoppilot.local');

    const addResponse = await fetch(`${baseUrl}/cart/items`, {
      method: 'POST',
      headers: {
        cookie: customerCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        productId: 'arrival-oversized-tank',
        size: 'm',
        quantity: 1,
      }),
    });

    const addPayload = (await addResponse.json()) as {
      items: Array<{ itemId: string }>;
    };

    const ownerItemId = addPayload.items[0]?.itemId;
    if (!ownerItemId) {
      throw new Error('Expected cart item id for isolation check.');
    }

    const otherCartResponse = await fetch(`${baseUrl}/cart`, {
      headers: {
        cookie: otherCustomerCookie,
      },
    });

    const otherCartPayload = (await otherCartResponse.json()) as {
      items: unknown[];
      summary: { itemCount: number };
    };

    expect(otherCartResponse.status).toBe(200);
    expect(otherCartPayload.items).toEqual([]);
    expect(otherCartPayload.summary.itemCount).toBe(0);

    const crossUpdate = await fetch(`${baseUrl}/cart/items/${ownerItemId}`, {
      method: 'PATCH',
      headers: {
        cookie: otherCustomerCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ quantity: 2 }),
    });

    const crossUpdatePayload = (await crossUpdate.json()) as CartErrorResponse;

    expect(crossUpdate.status).toBe(404);
    expect(crossUpdatePayload.error.code).toBe('CART_ITEM_NOT_FOUND');
  });

  it('marks lines invalid and excludes subtotal when stock drops below line quantity', async () => {
    const cookie = await getAuthCookie('customer@shoppilot.local');

    await fetch(`${baseUrl}/cart/items`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        productId: 'arrival-oversized-tank',
        size: 'm',
        quantity: 3,
      }),
    });

    prismaMock.setProductAvailability('arrival-oversized-tank', true, 2);

    const cartResponse = await fetch(`${baseUrl}/cart`, {
      headers: { cookie },
    });

    const cartPayload = (await cartResponse.json()) as {
      items: Array<{
        productId: string;
        quantity: number;
        isValid: boolean;
        invalidReason?: string;
        lineSubtotalCents: number;
      }>;
      summary: {
        itemCount: number;
        validLineCount: number;
        subtotalCents: number;
      };
    };

    expect(cartResponse.status).toBe(200);
    expect(cartPayload.items).toHaveLength(1);
    expect(cartPayload.items[0]).toMatchObject({
      productId: 'arrival-oversized-tank',
      quantity: 3,
      isValid: false,
      invalidReason: 'INSUFFICIENT_STOCK',
      lineSubtotalCents: 0,
    });
    expect(cartPayload.summary).toMatchObject({
      itemCount: 3,
      validLineCount: 0,
      subtotalCents: 0,
    });
  });

  it('marks lines unavailable when product availability is revoked', async () => {
    const cookie = await getAuthCookie('customer@shoppilot.local');

    await fetch(`${baseUrl}/cart/items`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        productId: 'essential-cropped-tee',
        size: 'm',
        quantity: 1,
      }),
    });

    prismaMock.setProductAvailability('essential-cropped-tee', false, 0);

    const cartResponse = await fetch(`${baseUrl}/cart`, {
      headers: { cookie },
    });

    const cartPayload = (await cartResponse.json()) as {
      items: Array<{
        productId: string;
        isValid: boolean;
        invalidReason?: string;
      }>;
      summary: {
        validLineCount: number;
        subtotalCents: number;
      };
    };

    expect(cartResponse.status).toBe(200);
    expect(cartPayload.items[0]).toMatchObject({
      productId: 'essential-cropped-tee',
      isValid: false,
      invalidReason: 'PRODUCT_UNAVAILABLE',
    });
    expect(cartPayload.summary.validLineCount).toBe(0);
    expect(cartPayload.summary.subtotalCents).toBe(0);
  });

  it('rejects unauthenticated cart access', async () => {
    const response = await fetch(`${baseUrl}/cart`);
    const payload = (await response.json()) as CartErrorResponse;

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe('AUTH_UNAUTHORIZED');
  });

  it('returns conflict when adding unavailable products', async () => {
    const cookie = await getAuthCookie('customer@shoppilot.local');

    const response = await fetch(`${baseUrl}/cart/items`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        productId: 'power-hoodie',
        size: 'm',
        quantity: 1,
      }),
    });

    const payload = (await response.json()) as CartErrorResponse;

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe('CART_PRODUCT_UNAVAILABLE');
  });
});
