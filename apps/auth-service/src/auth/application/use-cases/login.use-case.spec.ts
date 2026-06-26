import { UserEntity } from '../../domain/entities/user.entity';
import { UserRepositoryPort } from '../../domain/repositories/user.repository.port';
import { InvalidCredentialsError } from '../errors/invalid-credentials.error';
import { PasswordHasherPort } from '../ports/password-hasher.port';
import { TokenServicePort } from '../ports/token.service.port';
import { LoginUseCase } from './login.use-case';

describe('LoginUseCase', () => {
  const user = new UserEntity({
    id: 1n,
    email: 'testuser@test.com',
    passwordHash: 'hashed-password',
    role: 'ADMIN',
  });

  let users: jest.Mocked<UserRepositoryPort>;
  let passwordHasher: jest.Mocked<PasswordHasherPort>;
  let tokenService: jest.Mocked<TokenServicePort>;
  let useCase: LoginUseCase;

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(),
    };
    passwordHasher = {
      compare: jest.fn(),
    };
    tokenService = {
      sign: jest.fn(),
      verify: jest.fn(),
    };
    useCase = new LoginUseCase(users, passwordHasher, tokenService);
  });

  it('returns a JWT for valid credentials', async () => {
    users.findByEmail.mockResolvedValue(user);
    passwordHasher.compare.mockResolvedValue(true);
    tokenService.sign.mockResolvedValue('signed-token');

    await expect(
      useCase.execute({
        email: 'testuser@test.com',
        password: 'password123',
      }),
    ).resolves.toEqual({ token: 'signed-token' });

    expect(tokenService.sign).toHaveBeenCalledWith({
      userId: 1n,
      email: 'testuser@test.com',
      role: 'ADMIN',
    });
  });

  it('rejects unknown users', async () => {
    users.findByEmail.mockResolvedValue(null);

    await expect(
      useCase.execute({
        email: 'missing@test.com',
        password: 'password123',
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(passwordHasher.compare).not.toHaveBeenCalled();
    expect(tokenService.sign).not.toHaveBeenCalled();
  });

  it('rejects invalid passwords', async () => {
    users.findByEmail.mockResolvedValue(user);
    passwordHasher.compare.mockResolvedValue(false);

    await expect(
      useCase.execute({
        email: 'testuser@test.com',
        password: 'wrong-password',
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(tokenService.sign).not.toHaveBeenCalled();
  });
});
