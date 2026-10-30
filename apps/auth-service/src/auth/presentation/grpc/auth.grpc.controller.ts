import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { isEmail } from 'class-validator';
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { InvalidCredentialsError } from '../../application/errors/invalid-credentials.error';
import { InvalidTokenError } from '../../application/errors/invalid-token.error';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { ValidateTokenUseCase } from '../../application/use-cases/validate-token.use-case';

interface LoginGrpcRequest {
  email: string;
  password: string;
}

interface LoginGrpcResponse {
  success: boolean;
  token: string;
  message: string;
}

interface ValidateTokenGrpcRequest {
  token: string;
}

interface ValidateTokenGrpcResponse {
  is_valid: boolean;
  user_id: string;
  message: string;
  role: string;
}

@Controller()
export class AuthGrpcController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly validateTokenUseCase: ValidateTokenUseCase,
  ) {}

  @GrpcMethod('AuthService', 'Login')
  async login(request: LoginGrpcRequest): Promise<LoginGrpcResponse> {
    if (
      typeof request.email !== 'string' ||
      !isEmail(request.email) ||
      typeof request.password !== 'string' ||
      request.password.length < 8
    ) {
      throw new RpcException({ code: status.INVALID_ARGUMENT, message: 'Invalid login input.' });
    }
    try {
      const result = await this.loginUseCase.execute(request);

      return {
        success: true,
        token: result.token,
        message: 'OK',
      };
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        return {
          success: false,
          token: '',
          message: 'Invalid credentials',
        };
      }

      throw new RpcException({ code: status.INTERNAL, message: 'Internal server error' });
    }
  }

  @GrpcMethod('AuthService', 'ValidateToken')
  async validateToken(request: ValidateTokenGrpcRequest): Promise<ValidateTokenGrpcResponse> {
    try {
      const result = await this.validateTokenUseCase.execute({
        token: request.token,
      });

      return {
        is_valid: true,
        user_id: result.userId.toString(),
        message: 'OK',
        role: result.role,
      };
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        return {
          is_valid: false,
          user_id: '0',
          message: 'Invalid token',
          role: '',
        };
      }

      throw new RpcException({ code: status.INTERNAL, message: 'Internal server error' });
    }
  }
}
