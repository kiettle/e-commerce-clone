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
  login(request: LoginGrpcRequest): Observable<LoginGrpcResponse>;
  validateToken(request: ValidateTokenGrpcRequest): Observable<ValidateTokenGrpcResponse>;
}
