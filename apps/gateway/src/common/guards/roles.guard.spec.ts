import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { UserRole } from '../enums/user-role.enum';
import { AuthenticatedRequest } from '../types/authenticated-user';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  it('allows an administrator when ADMIN is required', () => {
    const guard = new RolesGuard(reflectorWith(UserRole.Admin));

    expect(guard.canActivate(contextWithRole(UserRole.Admin))).toBe(true);
  });

  it('rejects a normal user when ADMIN is required', () => {
    const guard = new RolesGuard(reflectorWith(UserRole.Admin));

    expect(() => guard.canActivate(contextWithRole(UserRole.User))).toThrow(ForbiddenException);
  });

  it('rejects an authenticated user with a missing role', () => {
    const guard = new RolesGuard(reflectorWith(UserRole.Admin));

    expect(() => guard.canActivate(contextWithRole(undefined))).toThrow(ForbiddenException);
  });

  it('rejects an authenticated user with an invalid role', () => {
    const guard = new RolesGuard(reflectorWith(UserRole.Admin));

    expect(() => guard.canActivate(contextWithRole('OWNER'))).toThrow(ForbiddenException);
  });
});

function reflectorWith(role: UserRole): Reflector {
  return {
    getAllAndOverride: vi.fn().mockReturnValue([role]),
  } as unknown as Reflector;
}

function contextWithRole(role: UserRole | string | undefined): ExecutionContext {
  const request = {
    headers: {},
    user: { userId: 10, role },
  } as unknown as AuthenticatedRequest;

  return {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
