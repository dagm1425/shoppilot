import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ProductCategory, ProductGender, ProductMediaRole, Role } from '@prisma/client';
import { parseEnv } from '../../src/config/env.js';
import { createTestApp } from '../helpers/test-app.js';

const env = parseEnv(process.env);

const adminUser = {
  id: 'user_admin_1',
  username: 'admin_1',
  email: 'admin@shoppilot.local',
  role: Role.ADMIN,
  sessionVersion: 0,
};

const customerUser = {
  id: 'user_customer_1',
  username: 'customer_1',
  email: 'customer@shoppilot.local',
  role: Role.CUSTOMER,
  sessionVersion: 0,
};

const users = [adminUser, customerUser];

describe('Admin products APIs (integration)', () => {
  const prismaMock = {
    user: {
      findUnique: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    productMedia: {
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  let lastPresignCall: { input: any; requestId: string | undefined } | null = null;

  const mediaStorageStub = {
    createPresignedUpload: async (input: any, requestId?: string) => {
      lastPresignCall = { input, requestId };
      return {
        role: input.role,
        objectKey: `products/2026/05/mock-${input.role}-${input.fileName}`,
        uploadUrl: `https://mock-upload.local/${input.role}/${input.fileName}`,
        publicUrl: `https://cdn.shoppilot.local/products/2026/05/mock-${input.role}-${input.fileName}`,
        expiresInSeconds: 600,
        requiredHeaders: {
          'content-type': input.contentType,
        },
      };
    },
  };

  let app: INestApplication;
  let baseUrl = '';
  let jwtService: JwtService;

  beforeAll(async () => {
    app = await createTestApp({
      prismaService: prismaMock,
      productMediaStorageService: mediaStorageStub,
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
    jest.clearAllMocks();
    lastPresignCall = null;

    prismaMock.user.findUnique.mockImplementation(async ({ where, select }: any) => {
      const user = where.id
        ? users.find((item) => item.id === where.id)
        : users.find((item) => item.email === where.email);

      if (!user) {
        return null;
      }

      if (!select) {
        return user;
      }

      return {
        ...(select.id ? { id: user.id } : {}),
        ...(select.username ? { username: user.username } : {}),
        ...(select.email ? { email: user.email } : {}),
        ...(select.role ? { role: user.role } : {}),
        ...(select.sessionVersion ? { sessionVersion: user.sessionVersion } : {}),
      };
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function cookieFor(user: typeof adminUser) {
    const token = await jwtService.signAsync({
      sub: user.id,
      role: user.role,
      sessionVersion: user.sessionVersion,
    });

    return `${env.AUTH_COOKIE_NAME}=${token}`;
  }

  it('enforces admin-only access on create endpoint', async () => {
    const response = await fetch(`${baseUrl}/products/admin`, {
      method: 'POST',
      headers: {
        cookie: await cookieFor(customerUser),
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('AUTH_FORBIDDEN');
  });

  it('creates products and rejects duplicate slugs', async () => {
    prismaMock.product.findUnique.mockResolvedValueOnce(null);
    prismaMock.product.create.mockResolvedValueOnce({
      id: 'product_2',
      slug: 'velocity-training-tee',
      name: 'Velocity Training Tee',
      description: 'Lightweight and breathable training tee for daily sessions.',
      category: ProductCategory.TOPS,
      gender: ProductGender.MEN,
      fit: 'Athletic',
      color: 'Black',
      priceCents: 3900,
      currency: 'USD',
      available: true,
      stock: 24,
      primaryImageUrl: 'https://cdn.example.com/products/velocity-primary.webp',
      secondaryImageUrl: 'https://cdn.example.com/products/velocity-secondary.webp',
      media: [
        {
          role: ProductMediaRole.PRIMARY,
          objectKey: 'products/2026/05/velocity-primary.webp',
          url: 'https://cdn.example.com/products/velocity-primary.webp',
          contentType: 'image/webp',
          sizeBytes: 201_120,
          altText: null,
        },
        {
          role: ProductMediaRole.SECONDARY,
          objectKey: 'products/2026/05/velocity-secondary.webp',
          url: 'https://cdn.example.com/products/velocity-secondary.webp',
          contentType: 'image/webp',
          sizeBytes: 170_333,
          altText: null,
        },
      ],
      createdAt: new Date('2026-05-17T12:30:00.000Z'),
      updatedAt: new Date('2026-05-17T12:30:00.000Z'),
    });

    const cookie = await cookieFor(adminUser);

    const createResponse = await fetch(`${baseUrl}/products/admin`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        slug: 'velocity-training-tee',
        name: 'Velocity Training Tee',
        description: 'Lightweight and breathable training tee for daily sessions.',
        category: 'tops',
        gender: 'men',
        fit: 'Athletic',
        color: 'Black',
        priceCents: 3900,
        stock: 24,
        available: true,
        media: {
          primary: {
            objectKey: 'products/2026/05/velocity-primary.webp',
            url: 'https://cdn.example.com/products/velocity-primary.webp',
            contentType: 'image/webp',
            sizeBytes: 201_120,
          },
          secondary: {
            objectKey: 'products/2026/05/velocity-secondary.webp',
            url: 'https://cdn.example.com/products/velocity-secondary.webp',
            contentType: 'image/webp',
            sizeBytes: 170_333,
          },
        },
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as { product: { productId: string } };
    expect(created.product.productId).toBe('velocity-training-tee');

    prismaMock.product.findUnique.mockResolvedValueOnce({ id: 'product_existing' });

    const conflictResponse = await fetch(`${baseUrl}/products/admin`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        slug: 'arrival-oversized-tank',
        name: 'Duplicate',
        description: 'Duplicate slug validation path.',
        category: 'tops',
        gender: 'men',
        fit: 'Oversized',
        color: 'Black',
        priceCents: 3200,
        stock: 9,
        available: true,
        media: {
          primary: {
            objectKey: 'products/2026/05/duplicate-primary.webp',
            url: 'https://cdn.example.com/products/duplicate-primary.webp',
            contentType: 'image/webp',
            sizeBytes: 112_000,
          },
        },
      }),
    });

    expect(conflictResponse.status).toBe(409);
    const conflict = (await conflictResponse.json()) as { error: { code: string } };
    expect(conflict.error.code).toBe('PRODUCT_SLUG_CONFLICT');
  });

  it('updates mutable fields for existing products', async () => {
    const existing = {
      id: 'product_1',
      slug: 'arrival-oversized-tank',
      name: 'Arrival Oversized Tank',
      description: 'Breathable training tank designed for daily workouts.',
      category: ProductCategory.TOPS,
      gender: ProductGender.MEN,
      fit: 'Oversized',
      color: 'Black',
      priceCents: 3000,
      currency: 'USD',
      available: true,
      stock: 24,
      primaryImageUrl: 'https://cdn.example.com/products/arrival-primary.webp',
      secondaryImageUrl: 'https://cdn.example.com/products/arrival-secondary.webp',
      media: [
        {
          role: ProductMediaRole.PRIMARY,
          url: 'https://cdn.example.com/products/arrival-primary.webp',
        },
      ],
    };

    const upsertSpy = jest.fn().mockResolvedValue(undefined);

    prismaMock.product.findUnique.mockResolvedValueOnce(existing);
    prismaMock.$transaction.mockImplementationOnce(async (callback: any) => {
      return callback({
        product: {
          update: async () => ({ id: 'product_1' }),
          findUniqueOrThrow: async () => ({
            ...existing,
            name: 'Arrival Oversized Tank v2',
            priceCents: 3400,
            stock: 31,
            available: false,
            primaryImageUrl: 'https://cdn.example.com/products/arrival-v2-primary.webp',
            media: [
              {
                role: ProductMediaRole.PRIMARY,
                objectKey: 'products/2026/05/arrival-v2-primary.webp',
                url: 'https://cdn.example.com/products/arrival-v2-primary.webp',
                contentType: 'image/webp',
                sizeBytes: 129_876,
                altText: null,
              },
            ],
            createdAt: new Date('2026-05-17T08:00:00.000Z'),
            updatedAt: new Date('2026-05-17T13:00:00.000Z'),
          }),
        },
        productMedia: {
          upsert: upsertSpy,
        },
      });
    });

    const response = await fetch(`${baseUrl}/products/admin/arrival-oversized-tank`, {
      method: 'PATCH',
      headers: {
        cookie: await cookieFor(adminUser),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Arrival Oversized Tank v2',
        priceCents: 3400,
        stock: 31,
        available: false,
        media: {
          primary: {
            objectKey: 'products/2026/05/arrival-v2-primary.webp',
            url: 'https://cdn.example.com/products/arrival-v2-primary.webp',
            contentType: 'image/webp',
            sizeBytes: 129_876,
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      product: {
        name: string;
        priceCents: number;
        stock: number;
        primaryImageUrl: string;
      };
    };
    expect(payload.product.name).toBe('Arrival Oversized Tank v2');
    expect(payload.product.priceCents).toBe(3400);
    expect(payload.product.stock).toBe(31);
    expect(payload.product.primaryImageUrl).toBe('https://cdn.example.com/products/arrival-v2-primary.webp');
    expect(upsertSpy).toHaveBeenCalledTimes(1);
  });

  it('returns presigned upload metadata for admin media requests', async () => {
    const response = await fetch(`${baseUrl}/products/admin/media/presign`, {
      method: 'POST',
      headers: {
        cookie: await cookieFor(adminUser),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        fileName: 'hero-primary.png',
        contentType: 'image/png',
        sizeBytes: 4096,
        role: 'primary',
      }),
    });

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      role: string;
      objectKey: string;
      requiredHeaders: { 'content-type': string };
    };

    expect(payload.role).toBe('primary');
    expect(payload.objectKey).toContain('mock-primary-hero-primary.png');
    expect(payload.requiredHeaders['content-type']).toBe('image/png');
    expect(lastPresignCall?.input.role).toBe('primary');
  });
});
