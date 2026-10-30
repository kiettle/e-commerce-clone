import { Metadata, type CallOptions } from '@grpc/grpc-js';
import { Observable } from 'rxjs';

export interface LoginGrpcRequest {
  email: string;
  password: string;
}

export interface LoginGrpcResponse {
  success: boolean;
  token: string;
  message?: string;
}

export interface ValidateTokenGrpcRequest {
  token: string;
}

export interface ValidateTokenGrpcResponse {
  is_valid: boolean;
  user_id: string;
  message?: string;
  role: string;
}

export interface AuthGrpcService {
  login(
    request: LoginGrpcRequest,
    metadata?: Metadata,
    options?: CallOptions,
  ): Observable<LoginGrpcResponse>;
  validateToken(
    request: ValidateTokenGrpcRequest,
    metadata?: Metadata,
    options?: CallOptions,
  ): Observable<ValidateTokenGrpcResponse>;
}
