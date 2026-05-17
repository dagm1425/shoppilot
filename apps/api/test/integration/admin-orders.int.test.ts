import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OrderStatus as PrismaOrderStatus, Role } from '@prisma/client';
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

type MockOrder = {
  id: string;
  orderNumber: string;
  contactEmail: string;
  status: PrismaOrderStatus;
  totalCents: number;
  currency: string;
  createdAt: Date;
  paidAt: Date | null;
};

type OrderFindManyArgs = {
  where?: {
    status?: PrismaOrderStatus;
    contactEmail?: {
      contains?: string;
      mode?: 'insensitive';
    };
    createdAt?: {
      gte?: Date;
      lt?: Date;
    };
  };
  orderBy?: {
    createdAt?: 'asc' | 'desc';
  };
  skip?: number;
  take?: number;
  select?: {
    id?: boolean;
    orderNumber?: boolean;
    contactEmail?: boolean;
    status?: boolean;
    totalCents?: boolean;
    currency?: boolean;
    createdAt?: boolean;
    paidAt?: boolean;
  };
};

type OrderCountArgs = {
  where?: OrderFindManyArgs['where'];
};

class InMemoryAdminOrdersPrisma {
  private users = new Map<string, MockUser>();
  private usersByEmail = new Map<string, string>();
  private orders = new Map<string, MockOrder>();

  reset(): void {
    this.users.clear();
    this.usersByEmail.clear();
    this.orders.clear();

    const adminUser: MockUser = {
      id: 'user_admin_1',
      username: 'admin_1',
      email: 'admin@shoppilot.local',
      role: Role.ADMIN,
      sessionVersion: 0,
    };

    const customerUser: MockUser = {
      id: 'user_customer_1',
      username: 'customer_1',
      email: 'customer@shoppilot.local',
      role: Role.CUSTOMER,
      sessionVersion: 0,
    };

    this.users.set(adminUser.id, adminUser);
    this.usersByEmail.set(adminUser.email, adminUser.id);
    this.users.set(customerUser.id, customerUser);
    this.usersByEmail.set(customerUser.email, customerUser.id);

    const seededOrders: MockOrder[] = [
      {
        id: 'order_1',
        orderNumber: 'SP-20260510-AAA111',
        contactEmail: 'alex@example.com',
        status: PrismaOrderStatus.PAID,
        totalCents: 6000,
        currency: 'USD',
        createdAt: new Date('2026-05-10T09:00:00.000Z'),
        paidAt: new Date('2026-05-10T09:10:00.000Z'),
      },
      {
        id: 'order_2',
        orderNumber: 'SP-20260511-BBB222',
        contactEmail: 'sam@example.com',
        status: PrismaOrderStatus.PENDING_PAYMENT,
        totalCents: 4500,
        currency: 'USD',
        createdAt: new Date('2026-05-11T09:00:00.000Z'),
        paidAt: null,
      },
      {
        id: 'order_3',
        orderNumber: 'SP-20260512-CCC333',
        contactEmail: 'alex@example.com',
        status: PrismaOrderStatus.PAID,
        totalCents: 8100,
        currency: 'USD',
        createdAt: new Date('2026-05-12T09:00:00.000Z'),
        paidAt: new Date('2026-05-12T09:15:00.000Z'),
      },
      {
        id: 'order_4',
        orderNumber: 'SP-20260513-DDD444',
        contactEmail: 'jamie@example.com',
        status: PrismaOrderStatus.PROCESSING,
        totalCents: 3000,
        currency: 'USD',
        createdAt: new Date('2026-05-13T09:00:00.000Z'),
        paidAt: new Date('2026-05-13T09:25:00.000Z'),
      },
      {
        id: 'order_5',
        orderNumber: 'SP-20260514-EEE555',
        contactEmail: 'alex@example.com',
        status: PrismaOrderStatus.PAID,
        totalCents: 11000,
        currency: 'USD',
        createdAt: new Date('2026-05-14T09:00:00.000Z'),
        paidAt: new Date('2026-05-14T09:20:00.000Z'),
      },
      {
        id: 'order_6',
        orderNumber: 'SP-20260515-FFF666',
        contactEmail: 'sam@example.com',
        status: PrismaOrderStatus.CANCELLED,
        totalCents: 7000,
        currency: 'USD',
        createdAt: new Date('2026-05-15T09:00:00.000Z'),
        paidAt: null,
      },
      {
        id: 'order_7',
        orderNumber: 'SP-20260516-GGG777',
        contactEmail: 'alex@example.com',
        status: PrismaOrderStatus.PAID,
        totalCents: 5200,
        currency: 'USD',
        createdAt: new Date('2026-05-16T09:00:00.000Z'),
        paidAt: new Date('2026-05-16T09:18:00.000Z'),
      },
      {
        id: 'order_8',
        orderNumber: 'SP-20260517-HHH888',
        contactEmail: 'sam@example.com',
        status: PrismaOrderStatus.PAID,
        totalCents: 9200,
        currency: 'USD',
        createdAt: new Date('2026-05-17T09:00:00.000Z'),
        paidAt: new Date('2026-05-17T09:09:00.000Z'),
      },
      {
        id: 'order_9',
        orderNumber: 'SP-20260518-III999',
        contactEmail: 'lee@example.com',
        status: PrismaOrderStatus.REFUNDED,
        totalCents: 4100,
        currency: 'USD',
        createdAt: new Date('2026-05-18T09:00:00.000Z'),
        paidAt: new Date('2026-05-18T09:14:00.000Z'),
      },
      {
        id: 'order_10',
        orderNumber: 'SP-20260519-JJJ000',
        contactEmail: 'alex@example.com',
        status: PrismaOrderStatus.PAID,
        totalCents: 12000,
        currency: 'USD',
        createdAt: new Date('2026-05-19T09:00:00.000Z'),
        paidAt: new Date('2026-05-19T09:16:00.000Z'),
      },
      {
        id: 'order_11',
        orderNumber: 'SP-20260520-KKK111',
        contactEmail: 'sam@example.com',
        status: PrismaOrderStatus.SHIPPED,
        totalCents: 7300,
        currency: 'USD',
        createdAt: new Date('2026-05-20T09:00:00.000Z'),
        paidAt: new Date('2026-05-20T09:14:00.000Z'),
      },
      {
        id: 'order_12',
        orderNumber: 'SP-20260521-LLL222',
        contactEmail: 'alex@example.com',
        status: PrismaOrderStatus.PAID,
        totalCents: 9800,
        currency: 'USD',
        createdAt: new Date('2026-05-21T09:00:00.000Z'),
        paidAt: new Date('2026-05-21T09:14:00.000Z'),
      },
    ];

    for (const order of seededOrders) {
      this.orders.set(order.id, order);
    }
  }

  getUserByEmail(email: string): MockUser {
    const userId = this.usersByEmail.get(email);
    if (!userId) {
      throw new Error(`User not found: ${email}`);
    }

    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User record missing: ${email}`);
    }

    return user;
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
      const id = args.where.id ?? this.usersByEmail.get(args.where.email ?? '');

      if (!id) {
        return null;
      }

      const user = this.users.get(id);
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

  readonly order = {
    findMany: async (args: OrderFindManyArgs) => {
      const filtered = this.applyOrderFilter(args.where);
      const direction = args.orderBy?.createdAt ?? 'desc';
      filtered.sort((a, b) =>
        direction === 'asc'
          ? a.createdAt.getTime() - b.createdAt.getTime()
          : b.createdAt.getTime() - a.createdAt.getTime(),
      );

      const skip = args.skip ?? 0;
      const take = args.take ?? filtered.length;
      const page = filtered.slice(skip, skip + take);

      return page.map((order) => {
        if (!args.select) {
          return { ...order };
        }

        return {
          ...(args.select.id ? { id: order.id } : {}),
          ...(args.select.orderNumber ? { orderNumber: order.orderNumber } : {}),
          ...(args.select.contactEmail ? { contactEmail: order.contactEmail } : {}),
          ...(args.select.status ? { status: order.status } : {}),
          ...(args.select.totalCents ? { totalCents: order.totalCents } : {}),
          ...(args.select.currency ? { currency: order.currency } : {}),
          ...(args.select.createdAt ? { createdAt: order.createdAt } : {}),
          ...(args.select.paidAt ? { paidAt: order.paidAt } : {}),
        };
      });
    },

    count: async (args: OrderCountArgs) => {
      return this.applyOrderFilter(args.where).length;
    },
  };

  async $transaction<T>(input: Promise<T>[]): Promise<T[]> {
    return Promise.all(input);
  }

  private applyOrderFilter(where?: OrderFindManyArgs['where']): MockOrder[] {
    let orders = [...this.orders.values()];
    const createdAtFilter = where?.createdAt;

    if (where?.status) {
      orders = orders.filter((order) => order.status === where.status);
    }

    if (where?.contactEmail?.contains) {
      const search = where.contactEmail.contains.toLowerCase();
      orders = orders.filter((order) => order.contactEmail.toLowerCase().includes(search));
    }

    const lowerBound = createdAtFilter?.gte;
    if (lowerBound) {
      orders = orders.filter((order) => order.createdAt >= lowerBound);
    }

    const upperBoundExclusive = createdAtFilter?.lt;
    if (upperBoundExclusive) {
      orders = orders.filter((order) => order.createdAt < upperBoundExclusive);
    }

    return orders;
  }
}

describe('Admin orders list (integration)', () => {
  const prismaMock = new InMemoryAdminOrdersPrisma();

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

  it('blocks customer role from admin orders list endpoint', async () => {
    const cookie = await getAuthCookie('customer@shoppilot.local');

    const response = await fetch(`${baseUrl}/orders/admin/list`, {
      headers: {
        cookie,
      },
    });

    expect(response.status).toBe(403);
    const payload = (await response.json()) as {
      error: {
        code: string;
      };
    };
    expect(payload.error.code).toBe('AUTH_FORBIDDEN');
  });

  it('returns paginated admin orders sorted by newest first', async () => {
    const cookie = await getAuthCookie('admin@shoppilot.local');

    const response = await fetch(`${baseUrl}/orders/admin/list?page=1&pageSize=5`, {
      headers: {
        cookie,
      },
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      items: Array<{ orderNumber: string }>;
      pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };
    };

    expect(payload.items).toHaveLength(5);
    expect(payload.items[0]?.orderNumber).toBe('SP-20260521-LLL222');
    expect(payload.pagination).toEqual({
      page: 1,
      pageSize: 5,
      total: 12,
      totalPages: 3,
    });
  });

  it('applies status, customer, and date filters together', async () => {
    const cookie = await getAuthCookie('admin@shoppilot.local');

    const response = await fetch(
      `${baseUrl}/orders/admin/list?status=paid&customer=alex@example.com&dateFrom=2026-05-14&dateTo=2026-05-19&page=1&pageSize=10`,
      {
        headers: {
          cookie,
        },
      },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      items: Array<{ orderNumber: string; customerEmail: string; status: string }>;
      pagination: { total: number };
      appliedFilters: {
        status?: string;
        customer?: string;
        dateFrom?: string;
        dateTo?: string;
      };
    };

    expect(payload.pagination.total).toBe(3);
    expect(payload.items.map((item) => item.orderNumber)).toEqual([
      'SP-20260519-JJJ000',
      'SP-20260516-GGG777',
      'SP-20260514-EEE555',
    ]);
    expect(payload.items.every((item) => item.customerEmail === 'alex@example.com')).toBe(true);
    expect(payload.items.every((item) => item.status === 'paid')).toBe(true);
    expect(payload.appliedFilters).toEqual({
      status: 'paid',
      customer: 'alex@example.com',
      dateFrom: '2026-05-14',
      dateTo: '2026-05-19',
    });
  });

  it('rejects invalid date windows', async () => {
    const cookie = await getAuthCookie('admin@shoppilot.local');

    const response = await fetch(
      `${baseUrl}/orders/admin/list?dateFrom=2026-05-20&dateTo=2026-05-01`,
      {
        headers: {
          cookie,
        },
      },
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as {
      error: {
        code: string;
      };
    };
    expect(payload.error.code).toBe('ORDER_VALIDATION_ERROR');
  });
});
