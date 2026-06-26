import { InvalidTokenError } from '../errors/invalid-token.error';
import { TokenServicePort } from '../ports/token.service.port';
import { ValidateTokenUseCase } from './validate-token.use-case';

describe('ValidateTokenUseCase', () => {
  let tokenService: jest.Mocked<TokenServicePort>;
  let useCase: ValidateTokenUseCase;

  beforeEach(() => {
    tokenService = {
      sign: jest.fn(),
      verify: jest.fn(),
    };
    useCase = new ValidateTokenUseCase(tokenService);
  });

  it('returns verified token claims', async () => {
    tokenService.verify.mockResolvedValue({
      userId: 1n,
      email: 'testuser@test.com',
      role: 'ADMIN',
    });

    await expect(useCase.execute({ token: 'valid-token' })).resolves.toEqual({
      userId: 1n,
      email: 'testuser@test.com',
      role: 'ADMIN',
    });
  });

  it('rejects invalid tokens', async () => {
    tokenService.verify.mockRejectedValue(new Error('bad token'));

    await expect(useCase.execute({ token: 'bad-token' })).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });
});
