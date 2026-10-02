import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { ValidateTokenUseCase } from '../../application/use-cases/validate-token.use-case';
import { InvalidCredentialsError } from '../../application/errors/invalid-credentials.error';
import { InvalidTokenError } from '../../application/errors/invalid-token.error';
import { LoginRequestDto } from './dto/login-request.dto';

interface LoginResponse {
  token: string;
}

@Controller('api/auth')
export class AuthHttpController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly validateTokenUseCase: ValidateTokenUseCase,
  ) {}

  @Post('login')
  async login(@Body() body: LoginRequestDto): Promise<LoginResponse> {
    try {
      return await this.loginUseCase.execute(body);
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        throw new UnauthorizedException('Invalid credentials');
      }

      throw error;
    }
  }

  @Get('validate')
  async validate(@Headers('authorization') authorization?: string): Promise<void> {
    const token = extractBearerToken(authorization);

    if (!token) {
      throw new UnauthorizedException('Invalid token');
    }

    try {
      await this.validateTokenUseCase.execute({ token });
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        throw new UnauthorizedException('Invalid token');
      }

      throw error;
    }
  }
}

function extractBearerToken(authorization?: string): string | null {
  const [scheme, token] = authorization?.split(' ') ?? [];

  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}
