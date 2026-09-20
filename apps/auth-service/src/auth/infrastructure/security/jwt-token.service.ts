import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import {
  SignTokenPayload,
  TokenServicePort,
  VerifiedTokenPayload,
} from '../../application/ports/token.service.port';
import { UserRole } from '../../domain/enums/user-role.enum';

interface JwtPayload {
  sub?: unknown;
  userId?: unknown;
  email?: unknown;
  role?: unknown;
}

@Injectable()
export class JwtTokenService implements TokenServicePort {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  sign(payload: SignTokenPayload): Promise<string> {
    return this.jwtService.signAsync(
      {
        userId: payload.userId.toString(),
        email: payload.email,
        role: parseRole(payload.role),
      },
      {
        subject: payload.email,
        secret: this.getJwtSecret(),
        expiresIn: this.getJwtExpiresIn(),
      },
    );
  }

  async verify(token: string): Promise<VerifiedTokenPayload> {
    const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
      secret: this.getJwtSecret(),
    });

    return {
      userId: parseUserId(payload.userId),
      email: parseEmail(payload.email ?? payload.sub),
      role: parseRole(payload.role),
    };
  }

  private getJwtSecret(): string {
    const secret = this.configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error('JWT_SECRET is required for auth-service.');
    }

    return secret;
  }

  private getJwtExpiresIn(): JwtSignOptions['expiresIn'] {
    return (this.configService.get<string>('JWT_EXPIRES_IN') ??
      '10h') as JwtSignOptions['expiresIn'];
  }
}

function parseUserId(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number' && Number.isInteger(value)) {
    return BigInt(value);
  }

  if (typeof value === 'string' && value.trim()) {
    return BigInt(value);
  }

  throw new Error('JWT payload is missing userId.');
}

function parseEmail(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  throw new Error('JWT payload is missing email.');
}

function parseRole(value: unknown): UserRole {
  if (value === UserRole.Admin || value === UserRole.User) {
    return value;
  }

  throw new Error('JWT payload has an invalid role.');
}
