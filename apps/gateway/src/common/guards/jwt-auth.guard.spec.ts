import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi, type Mocked } from 'vitest';
import { AuthFacade } from '../../auth/application/auth.facade';
import { UserRole } from '../enums/user-role.enum';
import { AuthenticatedRequest } from '../types/authenticated-user';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  it('returns 401 when the bearer token is missing', async () => {
    const auth = fakeAuthFacade();
    const guard = new JwtAuthGuard(auth);

    await expect(guard.canActivate(contextWith())).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth.validateToken).not.toHaveBeenCalled();
  });

  it('returns 401 when auth-service rejects the token', async () => {
    const auth = fakeAuthFacade();
    auth.validateToken.mockRejectedValue(new UnauthorizedException('Invalid token.'));
    const guard = new JwtAuthGuard(auth);

    await expect(guard.canActivate(contextWith('Bearer invalid'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('uses the identity and role returned by token validation', async () => {
    const auth = fakeAuthFacade();
    const user = { userId: 10, role: UserRole.Admin };
    auth.validateToken.mockResolvedValue(user);
    const request = requestWith('Bearer valid');
    const guard = new JwtAuthGuard(auth);

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(auth.validateToken).toHaveBeenCalledWith('valid');
    expect(request.user).toEqual(user);
  });
});

function fakeAuthFacade(): Mocked<AuthFacade> {
  return {
    login: vi.fn(),
    validateToken: vi.fn(),
  } as unknown as Mocked<AuthFacade>;
}

function contextWith(authorization?: string): ExecutionContext {
  return contextFor(requestWith(authorization));
}

function requestWith(authorization?: string): AuthenticatedRequest {
  return { headers: { authorization } };
}

function contextFor(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
