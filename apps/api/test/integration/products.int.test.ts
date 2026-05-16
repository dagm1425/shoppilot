import type { INestApplication } from '@nestjs/common';
import { ProductCategory, ProductGender } from '@prisma/client';
import { createTestApp } from '../helpers/test-app.js';

type CatalogErrorResponse = {
  error: {
    code: string;
    message: string;
    traceId: string;
  };
};

type MockProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: ProductCategory;
  gender: ProductGender;
  fit: string;
  color: string;
  priceCents: number;
  currency: string;
  available: boolean;
  stock: number;
  primaryImageUrl: string;
  secondaryImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const BASE_PRODUCTS: MockProduct[] = [
  {
    id: 'p1',
    slug: 'arrival-oversized-tank',
    name: 'Arrival Oversized Tank',
    description: 'Breathable gym tank.',
    category: ProductCategory.TOPS,
    gender: ProductGender.MEN,
    fit: 'Oversized fit',
    color: 'Force Blue',
    priceCents: 3000,
    currency: 'USD',
    available: true,
    stock: 18,
    primaryImageUrl: 'https://example.com/arrival-a.jpg',
    secondaryImageUrl: 'https://example.com/arrival-b.jpg',
    createdAt: new Date('2026-05-01T08:00:00.000Z'),
    updatedAt: new Date('2026-05-01T08:00:00.000Z'),
  },
  {
    id: 'p2',
    slug: 'essential-cropped-tee',
    name: 'Essential Cropped Tee',
    description: 'Soft cropped tee for training.',
    category: ProductCategory.TOPS,
    gender: ProductGender.WOMEN,
    fit: 'Relaxed fit',
    color: 'White',
    priceCents: 2400,
    currency: 'USD',
    available: true,
    stock: 30,
    primaryImageUrl: 'https://example.com/tee-a.jpg',
    secondaryImageUrl: 'https://example.com/tee-b.jpg',
    createdAt: new Date('2026-05-02T08:00:00.000Z'),
    updatedAt: new Date('2026-05-02T08:00:00.000Z'),
  },
  {
    id: 'p3',
    slug: 'vital-seamless-legging',
    name: 'Vital Seamless Legging',
    description: 'High-rise legging.',
    category: ProductCategory.BOTTOMS,
    gender: ProductGender.WOMEN,
    fit: 'High-rise fit',
    color: 'Night Grey',
    priceCents: 4800,
    currency: 'USD',
    available: true,
    stock: 14,
    primaryImageUrl: 'https://example.com/legging-a.jpg',
    secondaryImageUrl: 'https://example.com/legging-b.jpg',
    createdAt: new Date('2026-05-03T08:00:00.000Z'),
    updatedAt: new Date('2026-05-03T08:00:00.000Z'),
  },
  {
    id: 'p4',
    slug: 'power-hoodie',
    name: 'Power Hoodie',
    description: 'Mid-weight hoodie.',
    category: ProductCategory.TOPS,
    gender: ProductGender.MEN,
    fit: 'Regular fit',
    color: 'Black',
    priceCents: 6000,
    currency: 'USD',
    available: false,
    stock: 0,
    primaryImageUrl: 'https://example.com/hoodie-a.jpg',
    secondaryImageUrl: 'https://example.com/hoodie-b.jpg',
    createdAt: new Date('2026-05-04T08:00:00.000Z'),
    updatedAt: new Date('2026-05-04T08:00:00.000Z'),
  },
  {
    id: 'p5',
    slug: 'lift-seamless-tee',
    name: 'Lift Seamless Tee',
    description: 'Seamless tee for lifting days.',
    category: ProductCategory.TOPS,
    gender: ProductGender.MEN,
    fit: 'Slim fit',
    color: 'Olive',
    priceCents: 3200,
    currency: 'USD',
    available: true,
    stock: 11,
    primaryImageUrl: 'https://example.com/lift-a.jpg',
    secondaryImageUrl: null,
    createdAt: new Date('2026-05-05T08:00:00.000Z'),
    updatedAt: new Date('2026-05-05T08:00:00.000Z'),
  },
];

class InMemoryProductsPrisma {
  private products: MockProduct[] = [];

  constructor() {
    this.reset();
  }

  reset(): void {
    this.products = BASE_PRODUCTS.map((product) => ({ ...product }));
  }

  readonly product = {
    findMany: async (args: {
      where?: {
        category?: ProductCategory;
        gender?: ProductGender;
        priceCents?: {
          lt?: number;
          lte?: number;
          gt?: number;
          gte?: number;
        };
        OR?: Array<{
          name?: { contains: string; mode: 'insensitive' };
          description?: { contains: string; mode: 'insensitive' };
        }>;
      };
      skip?: number;
      take?: number;
      orderBy?: Array<{
        createdAt?: 'asc' | 'desc';
        name?: 'asc' | 'desc';
        priceCents?: 'asc' | 'desc';
      }>;
    }) => {
      const filtered = this.applyWhere(args.where);
      const sorted = this.applyOrderBy(filtered, args.orderBy ?? []);
      const skip = args.skip ?? 0;
      const take = args.take ?? sorted.length;

      return sorted.slice(skip, skip + take).map((product) => ({ ...product }));
    },
    count: async (args?: {
      where?: {
        category?: ProductCategory;
        gender?: ProductGender;
        priceCents?: {
          lt?: number;
          lte?: number;
          gt?: number;
          gte?: number;
        };
        OR?: Array<{
          name?: { contains: string; mode: 'insensitive' };
          description?: { contains: string; mode: 'insensitive' };
        }>;
      };
    }) => this.applyWhere(args?.where).length,
    findUnique: async (args: { where: { slug: string } }) => {
      const product = this.products.find((entry) => entry.slug === args.where.slug);
      return product ? { ...product } : null;
    },
  };

  async $transaction<T>(tasks: Array<Promise<T>>): Promise<T[]> {
    return Promise.all(tasks);
  }

  private applyWhere(
    where?: {
      category?: ProductCategory;
      gender?: ProductGender;
      priceCents?: {
        lt?: number;
        lte?: number;
        gt?: number;
        gte?: number;
      };
      OR?: Array<{
        name?: { contains: string; mode: 'insensitive' };
        description?: { contains: string; mode: 'insensitive' };
      }>;
    },
  ): MockProduct[] {
    return this.products.filter((product) => {
      if (where?.category && product.category !== where.category) {
        return false;
      }

      if (where?.gender && product.gender !== where.gender) {
        return false;
      }

      if (where?.priceCents) {
        const { lt, lte, gt, gte } = where.priceCents;
        if (typeof lt === 'number' && !(product.priceCents < lt)) {
          return false;
        }
        if (typeof lte === 'number' && !(product.priceCents <= lte)) {
          return false;
        }
        if (typeof gt === 'number' && !(product.priceCents > gt)) {
          return false;
        }
        if (typeof gte === 'number' && !(product.priceCents >= gte)) {
          return false;
        }
      }

      if (!where?.OR || where.OR.length === 0) {
        return true;
      }

      return where.OR.some((condition) => {
        if (condition.name?.contains) {
          return product.name
            .toLowerCase()
            .includes(condition.name.contains.toLowerCase());
        }

        if (condition.description?.contains) {
          return product.description
            .toLowerCase()
            .includes(condition.description.contains.toLowerCase());
        }

        return false;
      });
    });
  }

  private applyOrderBy(
    products: MockProduct[],
    orderBy: Array<{ createdAt?: 'asc' | 'desc'; name?: 'asc' | 'desc'; priceCents?: 'asc' | 'desc' }>,
  ): MockProduct[] {
    if (orderBy.length === 0) {
      return [...products];
    }

    const sorted = [...products];
    sorted.sort((left, right) => {
      for (const order of orderBy) {
        const [field, direction] = Object.entries(order)[0] ?? [];

        if (!field || !direction) {
          continue;
        }

        const fieldName = field as 'createdAt' | 'name' | 'priceCents';
        const leftValue = left[fieldName];
        const rightValue = right[fieldName];

        if (leftValue === rightValue) {
          continue;
        }

        const leftComparable = leftValue instanceof Date ? leftValue.getTime() : leftValue;
        const rightComparable = rightValue instanceof Date ? rightValue.getTime() : rightValue;

        if (leftComparable < rightComparable) {
          return direction === 'asc' ? -1 : 1;
        }

        return direction === 'asc' ? 1 : -1;
      }

      return 0;
    });

    return sorted;
  }
}

describe('Products API (integration)', () => {
  const prismaMock = new InMemoryProductsPrisma();
  let app: INestApplication;
  let baseUrl = '';

  beforeAll(async () => {
    app = await createTestApp({
      prismaService: prismaMock as never,
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns paginated catalog results with filter/search/sort', async () => {
    const response = await fetch(
      `${baseUrl}/products?page=1&pageSize=2&sort=price-asc&category=tops&gender=women&price=under-25&q=tee`,
    );

    const payload = (await response.json()) as {
      items: Array<{ productId: string; priceCents: number }>;
      pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };
      appliedFilters: {
        sort: string;
        category?: string;
        gender?: string;
        price?: string;
        q?: string;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.items.map((item) => item.productId)).toEqual(['essential-cropped-tee']);
    expect(payload.pagination).toEqual({
      page: 1,
      pageSize: 2,
      total: 1,
      totalPages: 1,
    });
    expect(payload.appliedFilters).toEqual({
      sort: 'price-asc',
      category: 'tops',
      gender: 'women',
      price: 'under-25',
      q: 'tee',
    });
  });

  it('clamps oversized pageSize values to safe bounds', async () => {
    const response = await fetch(`${baseUrl}/products?page=1&pageSize=999`);

    const payload = (await response.json()) as {
      pagination: { pageSize: number };
    };

    expect(response.status).toBe(200);
    expect(payload.pagination.pageSize).toBe(36);
  });

  it('returns validation error for unsupported sort value', async () => {
    const response = await fetch(`${baseUrl}/products?sort=recently-added`);
    const payload = (await response.json()) as CatalogErrorResponse;

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('CATALOG_VALIDATION_ERROR');
  });

  it('returns empty successful response when no products match', async () => {
    const response = await fetch(`${baseUrl}/products?q=not-in-catalog`);
    const payload = (await response.json()) as {
      items: unknown[];
      pagination: { total: number; totalPages: number };
    };

    expect(response.status).toBe(200);
    expect(payload.items).toEqual([]);
    expect(payload.pagination.total).toBe(0);
    expect(payload.pagination.totalPages).toBe(0);
  });

  it('returns detail response for existing product and 404 for unknown ids', async () => {
    const detailResponse = await fetch(`${baseUrl}/products/power-hoodie`);
    const detailPayload = (await detailResponse.json()) as {
      product: {
        productId: string;
        available: boolean;
        stock: number;
      };
    };

    expect(detailResponse.status).toBe(200);
    expect(detailPayload.product.productId).toBe('power-hoodie');
    expect(detailPayload.product.available).toBe(false);
    expect(detailPayload.product.stock).toBe(0);

    const notFoundResponse = await fetch(`${baseUrl}/products/missing-product`);
    const notFoundPayload = (await notFoundResponse.json()) as CatalogErrorResponse;

    expect(notFoundResponse.status).toBe(404);
    expect(notFoundPayload.error.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('exposes a non-production debug error trigger for Sentry wiring', async () => {
    const response = await fetch(`${baseUrl}/products/_debug/error`);
    const payload = (await response.json()) as CatalogErrorResponse;

    expect(response.status).toBe(500);
    expect(payload.error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
