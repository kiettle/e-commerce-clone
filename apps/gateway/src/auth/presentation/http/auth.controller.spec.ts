import { AuthFacade } from '../../application/auth.facade';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  let authFacade: jest.Mocked<AuthFacade>;
  let controller: AuthController;

  beforeEach(() => {
    authFacade = {
      login: jest.fn(),
      validateToken: jest.fn(),
    } as unknown as jest.Mocked<AuthFacade>;
    controller = new AuthController(authFacade);
  });

  it('forwards login DTO to the auth facade', async () => {
    authFacade.login.mockResolvedValue({ token: 'jwt-token' });

    await expect(
      controller.login({
        email: 'testuser@test.com',
        password: 'password123',
      }),
    ).resolves.toEqual({ token: 'jwt-token' });

    expect(authFacade.login).toHaveBeenCalledWith({
      email: 'testuser@test.com',
      password: 'password123',
    });
  });

  it('returns the guard-attached current user', () => {
    expect(controller.validate({ userId: 1 })).toEqual({ userId: 1 });
  });
});
