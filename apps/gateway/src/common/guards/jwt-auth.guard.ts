import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthFacade } from '../../auth/application/auth.facade';
import { AuthenticatedRequest } from '../types/authenticated-user';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authFacade: AuthFacade) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Missing or invalid bearer token.');
    }

    request.user = await this.authFacade.validateToken(token);

    return true;
  }
}

function extractBearerToken(
  authorization: string | string[] | undefined,
): string | null {
  if (Array.isArray(authorization)) {
    return extractBearerToken(authorization[0]);
  }

  const [scheme, token] = authorization?.split(' ') ?? [];

  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}
