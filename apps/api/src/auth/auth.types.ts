import type { Role } from '@prisma/client';

export type AuthenticatedRequestUser = {
  id: string;
  username: string | null;
  email: string;
  role: Role;
  sessionVersion: number;
};

export type AuthTokenPayload = {
  sub: string;
  role: Role;
  sessionVersion: number;
  iat?: number;
  exp?: number;
};
