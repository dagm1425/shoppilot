import 'reflect-metadata';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { ExecutionContext } from '@nestjs/common';
import { ROLES_KEY, Roles } from '../../src/auth/roles.decorator.js';
import { RolesGuard } from '../../src/auth/roles.guard.js';

function createExecutionContext(user?: { role?: Role } | null): ExecutionContext {
  const request = user === undefined ? {} : { user };

  return {
    getHandler: () => function handler() {},
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('returns true when no role metadata is required', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(createExecutionContext())).toBe(true);
  });

  it('throws unauthorized when roles are required without an authenticated user', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.ADMIN]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(createExecutionContext())).toThrow(UnauthorizedException);
  });

  it('throws forbidden when user role does not match required role', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.ADMIN]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() =>
      guard.canActivate(createExecutionContext({ role: Role.CUSTOMER })),
    ).toThrow(ForbiddenException);
  });

  it('throws forbidden for malformed authenticated payload without role', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.ADMIN]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(createExecutionContext({}))).toThrow(ForbiddenException);
  });

  it('allows access when user role matches required role', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.ADMIN]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(createExecutionContext({ role: Role.ADMIN }))).toBe(true);
  });
});

describe('Roles decorator', () => {
  class TestController {
    @Roles(Role.ADMIN, Role.CUSTOMER)
    handler() {
      return true;
    }
  }

  it('stores required roles as route metadata', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, TestController.prototype.handler);
    expect(roles).toEqual([Role.ADMIN, Role.CUSTOMER]);
  });
});
