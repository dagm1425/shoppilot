import { createHash } from 'node:crypto';
import argon2 from 'argon2';
import type { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { parseEnv } from '../../src/config/env.js';
import { createTestApp } from '../helpers/test-app.js';

const env = parseEnv(process.env);

type AuthErrorResponse = {
  error: {
    code: string;
    message: string;
    traceId: string;
  };
};

type MockUser = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  sessionVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

type MockResetToken = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

type MockPasswordResetMail = {
  userId: string;
  email: string;
  resetToken: string;
  requestId?: string;
};

class InMemoryPrisma {
  private idCounter = 0;
  private users = new Map<string, MockUser>();
  private usersByEmail = new Map<string, string>();
  private resetTokens = new Map<string, MockResetToken>();
  private resetTokensByHash = new Map<string, string>();

  reset(): void {
    this.idCounter = 0;
    this.users.clear();
    this.usersByEmail.clear();
    this.resetTokens.clear();
    this.resetTokensByHash.clear();
  }

  getUserByEmail(email: string): MockUser | undefined {
    const id = this.usersByEmail.get(email);
    if (!id) {
      return undefined;
    }

    return this.users.get(id);
  }

  expireResetToken(rawToken: string): void {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const tokenId = this.resetTokensByHash.get(tokenHash);
    if (!tokenId) {
      throw new Error('Reset token not found for expiration');
    }

    const token = this.resetTokens.get(tokenId);
    if (!token) {
      throw new Error('Reset token record missing');
    }

    token.expiresAt = new Date(Date.now() - 1_000);
    this.resetTokens.set(token.id, token);
  }

  async addUser(data: {
    email: string;
    passwordHash: string;
    role: Role;
  }): Promise<MockUser> {
    const now = new Date();
    const user: MockUser = {
      id: this.nextId('user'),
      email: data.email,
      passwordHash: data.passwordHash,
      role: data.role,
      sessionVersion: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(user.id, user);
    this.usersByEmail.set(user.email, user.id);
    return user;
  }

  readonly user = {
    findUnique: async (args: {
      where: { id?: string; email?: string };
      select?: {
        id?: boolean;
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
        ...(args.select.email ? { email: user.email } : {}),
        ...(args.select.role ? { role: user.role } : {}),
        ...(args.select.sessionVersion ? { sessionVersion: user.sessionVersion } : {}),
      };
    },
    create: async (args: {
      data: { email: string; passwordHash: string; role: Role };
      select?: {
        id?: boolean;
        email?: boolean;
        role?: boolean;
        sessionVersion?: boolean;
      };
    }) => {
      const user = await this.addUser(args.data);

      if (!args.select) {
        return user;
      }

      return {
        ...(args.select.id ? { id: user.id } : {}),
        ...(args.select.email ? { email: user.email } : {}),
        ...(args.select.role ? { role: user.role } : {}),
        ...(args.select.sessionVersion ? { sessionVersion: user.sessionVersion } : {}),
      };
    },
    update: async (args: {
      where: { id: string };
      data: {
        passwordHash?: string;
        sessionVersion?: { increment: number };
      };
    }) => {
      const user = this.users.get(args.where.id);
      if (!user) {
        throw new Error('User not found');
      }

      if (typeof args.data.passwordHash === 'string') {
        user.passwordHash = args.data.passwordHash;
      }

      if (args.data.sessionVersion?.increment) {
        user.sessionVersion += args.data.sessionVersion.increment;
      }

      user.updatedAt = new Date();
      this.users.set(user.id, user);
      return { ...user };
    },
    deleteMany: async () => {
      this.users.clear();
      this.usersByEmail.clear();
      return { count: 0 };
    },
  };

  readonly passwordResetToken = {
    create: async (args: {
      data: { userId: string; tokenHash: string; expiresAt: Date };
    }) => {
      const token: MockResetToken = {
        id: this.nextId('reset'),
        userId: args.data.userId,
        tokenHash: args.data.tokenHash,
        expiresAt: args.data.expiresAt,
        usedAt: null,
        createdAt: new Date(),
      };

      this.resetTokens.set(token.id, token);
      this.resetTokensByHash.set(token.tokenHash, token.id);
      return { ...token };
    },
    findUnique: async (args: {
      where: { tokenHash: string };
      include?: {
        user?: { select: { id: true } };
      };
    }) => {
      const tokenId = this.resetTokensByHash.get(args.where.tokenHash);
      if (!tokenId) {
        return null;
      }

      const token = this.resetTokens.get(tokenId);
      if (!token) {
        return null;
      }

      if (args.include?.user) {
        const user = this.users.get(token.userId);
        return {
          ...token,
          user: user ? { id: user.id } : null,
        };
      }

      return { ...token };
    },
    update: async (args: { where: { id: string }; data: { usedAt: Date } }) => {
      const token = this.resetTokens.get(args.where.id);
      if (!token) {
        throw new Error('Reset token not found');
      }

      token.usedAt = args.data.usedAt;
      this.resetTokens.set(token.id, token);
      return { ...token };
    },
    updateMany: async (args: {
      where: { userId: string; usedAt: null };
      data: { usedAt: Date };
    }) => {
      let count = 0;
      for (const token of this.resetTokens.values()) {
        if (token.userId === args.where.userId && token.usedAt === args.where.usedAt) {
          token.usedAt = args.data.usedAt;
          this.resetTokens.set(token.id, token);
          count += 1;
        }
      }

      return { count };
    },
    deleteMany: async () => {
      this.resetTokens.clear();
      this.resetTokensByHash.clear();
      return { count: 0 };
    },
  };

  async $transaction<T>(tasks: Array<Promise<T>>): Promise<T[]> {
    return Promise.all(tasks);
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}_${this.idCounter}`;
  }
}

class InMemoryPasswordResetMailer {
  throwOnSend = false;
  sentMessages: MockPasswordResetMail[] = [];

  reset(): void {
    this.throwOnSend = false;
    this.sentMessages = [];
  }

  async sendResetLink(input: MockPasswordResetMail): Promise<void> {
    this.sentMessages.push(input);

    if (this.throwOnSend) {
      throw new Error('resend failure');
    }
  }
}

function getCookieHeader(response: Response): string {
  const cookie = response.headers.get('set-cookie');

  if (!cookie) {
    throw new Error('Expected auth cookie in response header');
  }

  return cookie.split(';')[0] ?? cookie;
}

describe('Auth flows (integration)', () => {
  const prismaMock = new InMemoryPrisma();
  const passwordResetMailerMock = new InMemoryPasswordResetMailer();

  let app: INestApplication;
  let baseUrl = '';

  beforeAll(async () => {
    app = await createTestApp({
      prismaService: prismaMock as never,
      passwordResetMailerService: passwordResetMailerMock as never,
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
    passwordResetMailerMock.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers and returns authenticated session cookie', async () => {
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'customer+1@shoppilot.local',
        password: 'SecurePass123',
      }),
    });

    const payload = (await response.json()) as {
      user: { email: string; role: Role };
    };

    expect(response.status).toBe(201);
    expect(payload.user.email).toBe('customer+1@shoppilot.local');
    expect(payload.user.role).toBe(Role.CUSTOMER);
    expect(response.headers.get('set-cookie')).toContain(env.AUTH_COOKIE_NAME);

    const storedUser = prismaMock.getUserByEmail('customer+1@shoppilot.local');
    expect(storedUser).toBeDefined();
    expect(storedUser?.passwordHash).not.toBe('SecurePass123');
    expect(storedUser?.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('rejects duplicate registration with auth error code', async () => {
    await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'customer+2@shoppilot.local',
        password: 'SecurePass123',
      }),
    });

    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'customer+2@shoppilot.local',
        password: 'SecurePass123',
      }),
    });

    const payload = (await response.json()) as AuthErrorResponse;

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe('AUTH_EMAIL_EXISTS');
  });

  it('supports login, me, and logout with session invalidation', async () => {
    await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'customer+1@shoppilot.local',
        password: 'SecurePass123',
      }),
    });

    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'customer+1@shoppilot.local',
        password: 'SecurePass123',
      }),
    });

    const cookie = getCookieHeader(loginResponse);

    const meResponse = await fetch(`${baseUrl}/auth/me`, {
      headers: { cookie },
    });

    expect(meResponse.status).toBe(200);

    const logoutResponse = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { cookie },
    });

    expect(logoutResponse.status).toBe(200);

    const meAfterLogout = await fetch(`${baseUrl}/auth/me`, {
      headers: { cookie },
    });

    const payload = (await meAfterLogout.json()) as AuthErrorResponse;
    expect(meAfterLogout.status).toBe(401);
    expect(payload.error.code).toBe('AUTH_UNAUTHORIZED');
  });

  it('processes password reset token lifecycle', async () => {
    await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'customer+1@shoppilot.local',
        password: 'OldPassword123',
      }),
    });

    const resetRequest = await fetch(`${baseUrl}/auth/password-reset/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'customer+1@shoppilot.local' }),
    });

    const requestPayload = (await resetRequest.json()) as { message: string };

    expect(resetRequest.status).toBe(200);
    expect(requestPayload.message).toContain('If an account exists');
    expect(passwordResetMailerMock.sentMessages).toHaveLength(1);
    const issuedToken = passwordResetMailerMock.sentMessages[0]?.resetToken;
    expect(issuedToken).toBeDefined();

    const confirmResponse = await fetch(`${baseUrl}/auth/password-reset/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: issuedToken,
        password: 'NewPassword123',
      }),
    });

    expect(confirmResponse.status).toBe(200);

    const oldLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'customer+1@shoppilot.local',
        password: 'OldPassword123',
      }),
    });

    expect(oldLogin.status).toBe(401);

    const newLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'customer+1@shoppilot.local',
        password: 'NewPassword123',
      }),
    });

    expect(newLogin.status).toBe(200);

    const reusedToken = await fetch(`${baseUrl}/auth/password-reset/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: issuedToken,
        password: 'ThirdPassword123',
      }),
    });

    const reusedPayload = (await reusedToken.json()) as AuthErrorResponse;
    expect(reusedToken.status).toBe(400);
    expect(reusedPayload.error.code).toBe('AUTH_RESET_TOKEN_INVALID');
  });

  it('returns generic reset-request response for unknown emails', async () => {
    const response = await fetch(`${baseUrl}/auth/password-reset/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'unknown-user@shoppilot.local',
      }),
    });

    const payload = (await response.json()) as { message: string };

    expect(response.status).toBe(200);
    expect(payload.message).toContain('If an account exists');
    expect(passwordResetMailerMock.sentMessages).toHaveLength(0);
  });

  it('sends reset delivery without exposing token in response', async () => {
    await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'customer+mail@shoppilot.local',
        password: 'SecurePass123',
      }),
    });

    const response = await fetch(`${baseUrl}/auth/password-reset/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'customer+mail@shoppilot.local',
      }),
    });

    const payload = (await response.json()) as { message: string };

    expect(response.status).toBe(200);
    expect(payload.message).toContain('If an account exists');
    expect(passwordResetMailerMock.sentMessages).toHaveLength(1);
    expect(passwordResetMailerMock.sentMessages[0]?.email).toBe(
      'customer+mail@shoppilot.local',
    );
    expect(passwordResetMailerMock.sentMessages[0]?.requestId).toBe(
      response.headers.get('x-request-id') ?? undefined,
    );
  });

  it('returns generic response when reset delivery fails', async () => {
    passwordResetMailerMock.throwOnSend = true;

    await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'customer+mailfail@shoppilot.local',
        password: 'SecurePass123',
      }),
    });

    const response = await fetch(`${baseUrl}/auth/password-reset/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'customer+mailfail@shoppilot.local',
      }),
    });

    const payload = (await response.json()) as { message: string };

    expect(response.status).toBe(200);
    expect(payload.message).toContain('If an account exists');
    expect(passwordResetMailerMock.sentMessages).toHaveLength(1);
  });

  it('rejects expired reset tokens', async () => {
    await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'customer+expired@shoppilot.local',
        password: 'OldPassword123',
      }),
    });

    const resetRequest = await fetch(`${baseUrl}/auth/password-reset/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'customer+expired@shoppilot.local' }),
    });

    expect(passwordResetMailerMock.sentMessages).toHaveLength(1);
    const issuedToken = passwordResetMailerMock.sentMessages[0]?.resetToken;
    if (!issuedToken) {
      throw new Error('Expected issued reset token to exist');
    }

    prismaMock.expireResetToken(issuedToken);

    const response = await fetch(`${baseUrl}/auth/password-reset/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: issuedToken,
        password: 'NewPassword123',
      }),
    });

    const payload = (await response.json()) as AuthErrorResponse;
    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('AUTH_RESET_TOKEN_EXPIRED');
  });

  it('enforces role guard boundary for admin probe', async () => {
    await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'customer+1@shoppilot.local',
        password: 'SecurePass123',
      }),
    });

    const customerLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'customer+1@shoppilot.local',
        password: 'SecurePass123',
      }),
    });

    const customerCookie = getCookieHeader(customerLogin);

    const customerProbe = await fetch(`${baseUrl}/auth/admin-probe`, {
      headers: { cookie: customerCookie },
    });

    const forbiddenPayload = (await customerProbe.json()) as AuthErrorResponse;
    expect(customerProbe.status).toBe(403);
    expect(forbiddenPayload.error.code).toBe('AUTH_FORBIDDEN');

    const adminHash = await argon2.hash('AdminSecure123', {
      type: argon2.argon2id,
    });

    await prismaMock.addUser({
      email: 'admin+1@shoppilot.local',
      passwordHash: adminHash,
      role: Role.ADMIN,
    });

    const adminLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'admin+1@shoppilot.local',
        password: 'AdminSecure123',
      }),
    });

    const adminCookie = getCookieHeader(adminLogin);
    const adminProbe = await fetch(`${baseUrl}/auth/admin-probe`, {
      headers: { cookie: adminCookie },
    });

    expect(adminProbe.status).toBe(200);
  });

  it('throttles repeated login attempts', async () => {
    await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'rate-limit@shoppilot.local',
        password: 'SecurePass123',
      }),
    });

    let throttled = false;
    let throttledCode = '';

    for (let index = 0; index < env.AUTH_RATE_LIMIT_MAX + 5; index += 1) {
      const response = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'rate-limit@shoppilot.local',
          password: 'WrongPassword123',
        }),
      });

      if (response.status === 429) {
        const payload = (await response.json()) as AuthErrorResponse;
        throttledCode = payload.error.code;
        throttled = true;
        break;
      }
    }

    expect(throttled).toBe(true);
    expect(throttledCode).toBe('AUTH_RATE_LIMITED');
  });
});
