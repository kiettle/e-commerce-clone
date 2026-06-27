import {
  BadGatewayException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { of, throwError } from 'rxjs';
import { AuthGrpcClient } from './auth-grpc.client';
import { AuthGrpcService } from './auth-grpc.types';

class TestAuthGrpcClient extends AuthGrpcClient {
  private readonly closeMock = jest.fn();

  constructor(private readonly grpcService: jest.Mocked<AuthGrpcService>) {
    super({
      get: jest.fn().mockReturnValue('localhost:9005'),
    } as unknown as ConfigService);
  }

  protected createClient() {
    return {
      getService: jest.fn().mockReturnValue(this.grpcService),
      close: this.closeMock,
    } as never;
  }
}

describe('AuthGrpcClient', () => {
  let grpcService: jest.Mocked<AuthGrpcService>;
  let client: AuthGrpcClient;

  beforeEach(() => {
    grpcService = {
      login: jest.fn(),
      validateToken: jest.fn(),
    };
    client = new TestAuthGrpcClient(grpcService);
    client.onModuleInit();
  });

  it('maps successful login response to token', async () => {
    grpcService.login.mockReturnValue(
      of({ success: true, token: 'jwt-token', message: 'OK' }),
    );

    await expect(
      client.login({ email: 'testuser@test.com', password: 'password123' }),
    ).resolves.toEqual({ token: 'jwt-token' });
  });

  it('throws unauthorized when login response is unsuccessful', async () => {
    grpcService.login.mockReturnValue(
      of({ success: false, token: '', message: 'Invalid credentials' }),
    );

    await expect(
      client.login({ email: 'testuser@test.com', password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('maps valid token response to authenticated user', async () => {
    grpcService.validateToken.mockReturnValue(
      of({ is_valid: true, user_id: '1', message: 'OK' }),
    );

    await expect(client.validateToken('jwt-token')).resolves.toEqual({
      userId: 1,
    });
  });

  it('throws unauthorized when token response is invalid', async () => {
    grpcService.validateToken.mockReturnValue(
      of({ is_valid: false, user_id: '0', message: 'Invalid token' }),
    );

    await expect(client.validateToken('bad-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('maps unavailable gRPC errors to service unavailable', async () => {
    grpcService.validateToken.mockReturnValue(
      throwError(() => ({ code: GrpcStatus.UNAVAILABLE })),
    );

    await expect(client.validateToken('jwt-token')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('maps other gRPC errors to bad gateway', async () => {
    grpcService.validateToken.mockReturnValue(
      throwError(() => ({ code: GrpcStatus.UNKNOWN })),
    );

    await expect(client.validateToken('jwt-token')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
