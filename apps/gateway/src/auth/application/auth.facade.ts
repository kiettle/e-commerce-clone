import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  AuthGrpcClient,
  LoginResult,
} from '../infrastructure/grpc/auth-grpc.client';

export interface LoginCommand {
  email: string;
  password: string;
}

@Injectable()
export class AuthFacade {
  constructor(private readonly authGrpcClient: AuthGrpcClient) {}

  login(command: LoginCommand): Promise<LoginResult> {
    return this.authGrpcClient.login(command);
  }

  validateToken(token: string): Promise<AuthenticatedUser> {
    return this.authGrpcClient.validateToken(token);
  }
}
