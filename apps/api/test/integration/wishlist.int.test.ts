import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { parseEnv } from '../../src/config/env.js';
import { createTestApp } from '../helpers/test-app.js';

const env = parseEnv(process.env);

type WishlistErrorResponse = {
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

type MockWishlist = {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
};

type MockWishlistItem = {
  id: string;
  wishlistId: string;
  productId: string;
  createdAt: Date;
  updatedAt: Date;
};

class InMemoryWishlistPrisma {
  private idCounter = 0;
  private users = new Map<string, MockUser>();
  private usersByEmail = new Map<string, string>();
  private products = new Map<string, MockProduct>();
  private productsBySlug = new Map<string, string>();
  private wishlists = new Map<string, MockWishlist>();
  private wishlistsByUser = new Map<string, string>();
  private wishlistItems = new Map<string, MockWishlistItem>();

  reset(): void {
    this.idCounter = 0;
    this.users.clear();
    this.usersByEmail.clear();
    this.products.clear();
    this.productsBySlug.clear();
    this.wishlists.clear();
    this.wishlistsByUser.clear();
    this.wishlistItems.clear();

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

  readonly wishlist = {
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
      const existingWishlistId = this.wishlistsByUser.get(args.where.userId);
      let wishlist: MockWishlist;

      if (existingWishlistId) {
        const existing = this.wishlists.get(existingWishlistId);
        if (!existing) {
          throw new Error('Wishlist reference missing');
        }

        wishlist = { ...existing, updatedAt: new Date() };
      } else {
        wishlist = {
          id: this.nextId('wishlist'),
          userId: args.create.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        this.wishlistsByUser.set(wishlist.userId, wishlist.id);
      }

      this.wishlists.set(wishlist.id, wishlist);

      if (!args.include?.items) {
        return { ...wishlist };
      }

      return {
        ...wishlist,
        items: this.listWishlistItems(wishlist.id),
      };
    },
  };

  readonly wishlistItem = {
    create: async (args: {
      data: { wishlistId: string; productId: string };
    }) => {
      const item: MockWishlistItem = {
        id: this.nextId('wishlist_item'),
        wishlistId: args.data.wishlistId,
        productId: args.data.productId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.wishlistItems.set(item.id, item);
      return { ...item };
    },
    deleteMany: async (args: {
      where: {
        id?: string;
        wishlist?: { userId: string };
      };
    }) => {
      let count = 0;

      for (const item of [...this.wishlistItems.values()]) {
        if (args.where.id && item.id !== args.where.id) {
          continue;
        }

        if (args.where.wishlist?.userId) {
          const wishlist = this.wishlists.get(item.wishlistId);
          if (!wishlist || wishlist.userId !== args.where.wishlist.userId) {
            continue;
          }
        }

        this.wishlistItems.delete(item.id);
        count += 1;
      }

      return { count };
    },
  };

  private listWishlistItems(wishlistId: string) {
    return [...this.wishlistItems.values()]
      .filter((item) => item.wishlistId === wishlistId)
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

describe('Wishlist API (integration)', () => {
  const prismaMock = new InMemoryWishlistPrisma();

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

  it('returns an empty wishlist for an authenticated user with no items', async () => {
    const cookie = await getAuthCookie('customer@shoppilot.local');

    const response = await fetch(`${baseUrl}/wishlist`, {
      headers: { cookie },
    });

    const payload = (await response.json()) as {
      items: unknown[];
      summary: {
        itemCount: number;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.items).toEqual([]);
    expect(payload.summary.itemCount).toBe(0);
  });

  it('adds wishlist items and keeps entries unique per product', async () => {
    const cookie = await getAuthCookie('customer@shoppilot.local');

    const addFirst = await fetch(`${baseUrl}/wishlist/items`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        productId: 'arrival-oversized-tank',
      }),
    });

    expect(addFirst.status).toBe(201);

    const addSecond = await fetch(`${baseUrl}/wishlist/items`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        productId: 'arrival-oversized-tank',
      }),
    });

    const payload = (await addSecond.json()) as {
      items: Array<{ itemId: string; productId: string }>;
      summary: {
        itemCount: number;
      };
    };

    expect(addSecond.status).toBe(201);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      productId: 'arrival-oversized-tank',
    });
    expect(payload.summary.itemCount).toBe(1);
  });

  it('removes items and treats repeated deletes as idempotent', async () => {
    const cookie = await getAuthCookie('customer@shoppilot.local');

    const addResponse = await fetch(`${baseUrl}/wishlist/items`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        productId: 'essential-cropped-tee',
      }),
    });

    const addPayload = (await addResponse.json()) as {
      items: Array<{ itemId: string }>;
    };

    const itemId = addPayload.items[0]?.itemId;
    if (!itemId) {
      throw new Error('Expected wishlist item id after add request.');
    }

    const removeFirst = await fetch(`${baseUrl}/wishlist/items/${itemId}`, {
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

    const removeSecond = await fetch(`${baseUrl}/wishlist/items/${itemId}`, {
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

  it('isolates wishlist state across users and blocks cross-user deletes', async () => {
    const customerCookie = await getAuthCookie('customer@shoppilot.local');
    const otherCustomerCookie = await getAuthCookie('customer-two@shoppilot.local');

    const addResponse = await fetch(`${baseUrl}/wishlist/items`, {
      method: 'POST',
      headers: {
        cookie: customerCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        productId: 'arrival-oversized-tank',
      }),
    });

    const addPayload = (await addResponse.json()) as {
      items: Array<{ itemId: string }>;
    };

    const ownerItemId = addPayload.items[0]?.itemId;
    if (!ownerItemId) {
      throw new Error('Expected wishlist item id for isolation check.');
    }

    const otherWishlistResponse = await fetch(`${baseUrl}/wishlist`, {
      headers: { cookie: otherCustomerCookie },
    });
    const otherWishlistPayload = (await otherWishlistResponse.json()) as {
      items: unknown[];
      summary: { itemCount: number };
    };

    expect(otherWishlistResponse.status).toBe(200);
    expect(otherWishlistPayload.items).toEqual([]);
    expect(otherWishlistPayload.summary.itemCount).toBe(0);

    const crossRemove = await fetch(`${baseUrl}/wishlist/items/${ownerItemId}`, {
      method: 'DELETE',
      headers: { cookie: otherCustomerCookie },
    });
    const crossRemovePayload = (await crossRemove.json()) as {
      items: unknown[];
      summary: { itemCount: number };
    };

    expect(crossRemove.status).toBe(200);
    expect(crossRemovePayload.summary.itemCount).toBe(0);

    const ownerWishlistResponse = await fetch(`${baseUrl}/wishlist`, {
      headers: { cookie: customerCookie },
    });
    const ownerWishlistPayload = (await ownerWishlistResponse.json()) as {
      items: Array<{ itemId: string }>;
      summary: { itemCount: number };
    };

    expect(ownerWishlistResponse.status).toBe(200);
    expect(ownerWishlistPayload.summary.itemCount).toBe(1);
    expect(ownerWishlistPayload.items[0]?.itemId).toBe(ownerItemId);
  });

  it('returns not found when adding a product that does not exist', async () => {
    const cookie = await getAuthCookie('customer@shoppilot.local');

    const response = await fetch(`${baseUrl}/wishlist/items`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        productId: 'unknown-product',
      }),
    });

    const payload = (await response.json()) as WishlistErrorResponse;

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe('WISHLIST_PRODUCT_NOT_FOUND');
  });

  it('returns validation error when request payload is malformed', async () => {
    const cookie = await getAuthCookie('customer@shoppilot.local');

    const response = await fetch(`${baseUrl}/wishlist/items`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        productId: 'bad slug',
      }),
    });

    const payload = (await response.json()) as WishlistErrorResponse;

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('WISHLIST_VALIDATION_ERROR');
  });

  it('rejects unauthenticated wishlist access', async () => {
    const response = await fetch(`${baseUrl}/wishlist`);
    const payload = (await response.json()) as WishlistErrorResponse;

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe('AUTH_UNAUTHORIZED');
  });
});
