import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { InvalidTokenError } from '../../application/errors/invalid-token.error';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { ValidateTokenUseCase } from '../../application/use-cases/validate-token.use-case';
import { UserRole } from '../../domain/enums/user-role.enum';
import { AuthGrpcController } from './auth.grpc.controller';

describe('AuthGrpcController token validation', () => {
  let validateToken: Mocked<ValidateTokenUseCase>;
  let controller: AuthGrpcController;

  beforeEach(() => {
    validateToken = { execute: vi.fn() } as unknown as Mocked<ValidateTokenUseCase>;
    controller = new AuthGrpcController(
      { execute: vi.fn() } as unknown as LoginUseCase,
      validateToken,
    );
  });

  it('returns the role from the verified token result', async () => {
    validateToken.execute.mockResolvedValue({
      userId: 10n,
      email: 'admin@example.com',
      role: UserRole.Admin,
    });

    await expect(controller.validateToken({ token: 'signed-token' })).resolves.toEqual({
      is_valid: true,
      user_id: '10',
      message: 'OK',
      role: UserRole.Admin,
    });
    expect(validateToken.execute).toHaveBeenCalledWith({ token: 'signed-token' });
  });

  it('does not return a role for an invalid token', async () => {
    validateToken.execute.mockRejectedValue(new InvalidTokenError());

    await expect(controller.validateToken({ token: 'invalid' })).resolves.toEqual({
      is_valid: false,
      user_id: '0',
      message: 'Invalid token',
      role: '',
    });
  });
});
