import {
  BadGatewayException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientGrpc, ClientProxyFactory, Transport } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { join } from 'node:path';
import { firstValueFrom } from 'rxjs';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { UserRole } from '../../../common/enums/user-role.enum';
import { AuthGrpcService, LoginGrpcRequest, ValidateTokenGrpcResponse } from './auth-grpc.types';

interface CloseableClientGrpc extends ClientGrpc {
  close?: () => void;
}

interface GrpcErrorLike {
  code?: number;
  details?: string;
  message?: string;
}

export interface LoginResult {
  token: string;
}

@Injectable()
export class AuthGrpcClient implements OnModuleInit, OnModuleDestroy {
  private client?: CloseableClientGrpc;
  private authService?: AuthGrpcService;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.client = this.createClient();
    this.authService = this.client.getService<AuthGrpcService>('AuthService');
  }

  onModuleDestroy(): void {
    this.client?.close?.();
  }

  async login(request: LoginGrpcRequest): Promise<LoginResult> {
    try {
      const response = await firstValueFrom(this.getAuthService().login(request));

      if (!response.success) {
        throw new UnauthorizedException(response.message ?? 'Invalid credentials.');
      }

      return { token: response.token };
    } catch (error) {
      throw mapGrpcClientError(error);
    }
  }

  async validateToken(token: string): Promise<AuthenticatedUser> {
    try {
      const response = await firstValueFrom(this.getAuthService().validateToken({ token }));

      return mapValidateTokenResponse(response);
    } catch (error) {
      throw mapGrpcClientError(error);
    }
  }

  protected createClient(): CloseableClientGrpc {
    return ClientProxyFactory.create({
      transport: Transport.GRPC,
      options: {
        package: 'auth',
        protoPath: join(process.cwd(), 'libs/proto/auth.proto'),
        url: this.configService.get<string>('AUTH_GRPC_URL') ?? 'localhost:9005',
        loader: {
          keepCase: true,
          longs: String,
        },
      },
    }) as CloseableClientGrpc;
  }

  private getAuthService(): AuthGrpcService {
    if (!this.authService) {
      throw new ServiceUnavailableException('Auth gRPC client is not initialized.');
    }

    return this.authService;
  }
}

function mapValidateTokenResponse(response: ValidateTokenGrpcResponse): AuthenticatedUser {
  if (!response.is_valid) {
    throw new UnauthorizedException(response.message ?? 'Invalid token.');
  }

  const userId = Number(response.user_id);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new UnauthorizedException('Invalid token user.');
  }

  if (response.role !== UserRole.Admin && response.role !== UserRole.User) {
    throw new UnauthorizedException('Invalid token role.');
  }

  return { userId, role: response.role };
}

function mapGrpcClientError(error: unknown): Error {
  if (error instanceof UnauthorizedException) {
    return error;
  }

  const grpcError = error as GrpcErrorLike;

  if (grpcError.code === GrpcStatus.UNAVAILABLE) {
    return new ServiceUnavailableException('Auth service unavailable.');
  }

  if (grpcError.code === GrpcStatus.UNAUTHENTICATED) {
    return new UnauthorizedException(grpcError.details ?? grpcError.message);
  }

  if (grpcError.code !== undefined) {
    return new BadGatewayException('Auth service request failed.');
  }

  return error instanceof Error ? error : new BadGatewayException();
}
