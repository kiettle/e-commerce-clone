import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { UserEntity } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/enums/user-role.enum';
import { UserRepositoryPort } from '../../domain/repositories/user.repository.port';
import { InvalidCredentialsError } from '../errors/invalid-credentials.error';
import { PasswordHasherPort } from '../ports/password-hasher.port';
import { TokenServicePort } from '../ports/token.service.port';
import { LoginUseCase } from './login.use-case';

describe('LoginUseCase', () => {
  const command = {
    email: 'user@example.com',
    password: 'plain-password',
  };
  const user = new UserEntity({
    id: 1n,
    email: 'user@example.com',
    passwordHash: 'hashed-password',
    role: UserRole.User,
  });

  let users: Mocked<UserRepositoryPort>;
  let passwordHasher: Mocked<PasswordHasherPort>;
  let tokenService: Mocked<TokenServicePort>;
  let useCase: LoginUseCase;

  beforeEach(() => {
    users = {
      findByEmail: vi.fn(),
    };
    passwordHasher = {
      compare: vi.fn(),
    };
    tokenService = {
      sign: vi.fn(),
      verify: vi.fn(),
    };
    useCase = new LoginUseCase(users, passwordHasher, tokenService);
  });

  it('returns a token when the credentials are valid', async () => {
    // Arrange
    users.findByEmail.mockResolvedValue(user);
    passwordHasher.compare.mockResolvedValue(true);
    tokenService.sign.mockResolvedValue('signed-jwt');

    // Act
    const result = await useCase.execute(command);

    // Assert
    expect(users.findByEmail).toHaveBeenCalledWith('user@example.com');
    expect(passwordHasher.compare).toHaveBeenCalledWith('plain-password', 'hashed-password');
    expect(tokenService.sign).toHaveBeenCalledWith({
      userId: 1n,
      email: 'user@example.com',
      role: UserRole.User,
    });
    expect(result).toEqual({ token: 'signed-jwt' });
  });

  it('rejects the login when the user does not exist', async () => {
    // Arrange
    users.findByEmail.mockResolvedValue(null);

    // Act and assert
    await expect(useCase.execute(command)).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(users.findByEmail).toHaveBeenCalledWith('user@example.com');
    expect(passwordHasher.compare).not.toHaveBeenCalled();
    expect(tokenService.sign).not.toHaveBeenCalled();
  });

  it('rejects the login when the password is incorrect', async () => {
    // Arrange
    users.findByEmail.mockResolvedValue(user);
    passwordHasher.compare.mockResolvedValue(false);

    // Act and assert
    await expect(useCase.execute(command)).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(passwordHasher.compare).toHaveBeenCalledWith('plain-password', 'hashed-password');
    expect(tokenService.sign).not.toHaveBeenCalled();
  });

  it('propagates repository errors without checking the password', async () => {
    // Arrange
    const repositoryError = new Error('Repository unavailable');
    users.findByEmail.mockRejectedValue(repositoryError);

    // Act and assert
    await expect(useCase.execute(command)).rejects.toBe(repositoryError);
    expect(passwordHasher.compare).not.toHaveBeenCalled();
    expect(tokenService.sign).not.toHaveBeenCalled();
  });

  it('propagates password comparison errors without signing a token', async () => {
    // Arrange
    const comparisonError = new Error('Password comparison failed');
    users.findByEmail.mockResolvedValue(user);
    passwordHasher.compare.mockRejectedValue(comparisonError);

    // Act and assert
    await expect(useCase.execute(command)).rejects.toBe(comparisonError);
    expect(tokenService.sign).not.toHaveBeenCalled();
  });

  it('propagates token signing errors', async () => {
    // Arrange
    const signingError = new Error('Token signing failed');
    users.findByEmail.mockResolvedValue(user);
    passwordHasher.compare.mockResolvedValue(true);
    tokenService.sign.mockRejectedValue(signingError);

    // Act and assert
    await expect(useCase.execute(command)).rejects.toBe(signingError);
  });
});
