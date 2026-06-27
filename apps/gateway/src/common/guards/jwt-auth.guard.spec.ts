import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthFacade } from '../../auth/application/auth.facade';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let authFacade: jest.Mocked<AuthFacade>;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    authFacade = {
      login: jest.fn(),
      validateToken: jest.fn(),
    } as unknown as jest.Mocked<AuthFacade>;
    guard = new JwtAuthGuard(authFacade);
  });

  it('rejects missing authorization header', async () => {
    const { context } = createContext({});

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects malformed bearer token', async () => {
    const { context } = createContext({ authorization: 'Token abc' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects invalid tokens', async () => {
    authFacade.validateToken.mockRejectedValue(new UnauthorizedException());
    const { context } = createContext({ authorization: 'Bearer bad-token' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches authenticated user for valid tokens', async () => {
    authFacade.validateToken.mockResolvedValue({ userId: 1 });
    const { context, request } = createContext({
      authorization: 'Bearer valid-token',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(authFacade.validateToken).toHaveBeenCalledWith('valid-token');
    expect(request.user).toEqual({ userId: 1 });
  });
});

function createContext(headers: Record<string, string>) {
  const request = { headers, user: undefined };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return { context, request };
}
