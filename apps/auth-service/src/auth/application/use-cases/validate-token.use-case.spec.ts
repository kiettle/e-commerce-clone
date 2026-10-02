import { TokenServicePort } from '../ports/token.service.port';
import { UserRole } from '../../domain/enums/user-role.enum';
import { ValidateTokenUseCase } from './validate-token.use-case';
import { InvalidTokenError } from '../errors/invalid-token.error';
import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';

describe('ValidateTokenUseCase', () => {
  const command = {
    token: 'valid-token',
  };
  const verifiedUser = {
    userId: 1n,
    email: 'user@example.com',
    role: UserRole.User,
  };

  let tokenService: Mocked<TokenServicePort>;
  let validateTokenUseCase: ValidateTokenUseCase;

  beforeEach(() => {
    tokenService = {
      sign: vi.fn(),
      verify: vi.fn(),
    };
    validateTokenUseCase = new ValidateTokenUseCase(tokenService);
  });

  it('should validate a valid token', async () => {
    // Arrange
    tokenService.verify.mockResolvedValue(verifiedUser);

    // Act & Assert
    await expect(validateTokenUseCase.execute(command)).resolves.toEqual(verifiedUser);
    expect(tokenService.verify).toHaveBeenCalledWith('valid-token');
  });

  it('should throw an InvalidTokenError for an invalid token', async () => {
    // Arrange
    tokenService.verify.mockRejectedValue(new InvalidTokenError());

    // Act & Assert
    await expect(validateTokenUseCase.execute(command)).rejects.toBeInstanceOf(InvalidTokenError);
    expect(tokenService.verify).toHaveBeenCalledWith('valid-token');
  });
});
