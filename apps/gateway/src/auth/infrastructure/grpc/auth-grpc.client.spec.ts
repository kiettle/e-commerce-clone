import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { UserRole } from '../../../common/enums/user-role.enum';
import { AuthGrpcClient } from './auth-grpc.client';
import { AuthGrpcService, LoginGrpcResponse, ValidateTokenGrpcResponse } from './auth-grpc.types';

describe('AuthGrpcClient token mapping', () => {
  it.each([UserRole.Admin, UserRole.User])('maps the validated %s role', async (role) => {
    const client = clientWith({ is_valid: true, user_id: '10', message: 'OK', role });

    await expect(client.validateToken('signed-token')).resolves.toEqual({ userId: 10, role });
  });

  it.each(['', 'OWNER'])('rejects a missing or invalid role: %s', async (role) => {
    const client = clientWith({ is_valid: true, user_id: '10', message: 'OK', role });

    await expect(client.validateToken('signed-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

function clientWith(response: ValidateTokenGrpcResponse): AuthGrpcClient {
  const client = new AuthGrpcClient({ get: vi.fn() } as unknown as ConfigService);
  const service: AuthGrpcService = {
    login: (): Observable<LoginGrpcResponse> => of({ success: false, token: '' }),
    validateToken: (): Observable<ValidateTokenGrpcResponse> => of(response),
  };

  (client as unknown as { authService: AuthGrpcService }).authService = service;
  return client;
}
