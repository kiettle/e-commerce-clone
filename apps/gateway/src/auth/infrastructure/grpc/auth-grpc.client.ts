import { grpcDeadline, grpcTimeoutMs, grpcHttpError } from '@app/common';
import { Metadata } from '@grpc/grpc-js';
import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientGrpc, ClientProxyFactory, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { firstValueFrom } from 'rxjs';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { UserRole } from '../../../common/enums/user-role.enum';
import { AuthGrpcService, LoginGrpcRequest, ValidateTokenGrpcResponse } from './auth-grpc.types';

interface CloseableClientGrpc extends ClientGrpc {
  close?: () => void;
}

export interface LoginResult {
  token: string;
}

@Injectable()
export class AuthGrpcClient implements OnModuleInit, OnApplicationShutdown {
  private client?: CloseableClientGrpc;
  private authService?: AuthGrpcService;

  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.timeoutMs = grpcTimeoutMs(configService.get('GRPC_REQUEST_TIMEOUT_MS', 5000));
  }

  onModuleInit(): void {
    this.client = this.createClient();
    this.authService = this.client.getService<AuthGrpcService>('AuthService');
  }

  onApplicationShutdown(): void {
    this.client?.close?.();
  }

  async login(request: LoginGrpcRequest): Promise<LoginResult> {
    try {
      const response = await firstValueFrom(
        this.getAuthService().login(request, new Metadata(), grpcDeadline(this.timeoutMs)),
      );

      if (!response.success) {
        throw new UnauthorizedException(response.message ?? 'Invalid credentials.');
      }

      return { token: response.token };
    } catch (error) {
      throw grpcHttpError(error, 'Auth service');
    }
  }

  async validateToken(token: string): Promise<AuthenticatedUser> {
    try {
      const response = await firstValueFrom(
        this.getAuthService().validateToken(
          { token },
          new Metadata(),
          grpcDeadline(this.timeoutMs),
        ),
      );

      return mapValidateTokenResponse(response);
    } catch (error) {
      throw grpcHttpError(error, 'Auth service');
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
