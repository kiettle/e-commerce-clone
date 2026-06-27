import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthFacade } from '../../application/auth.facade';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { LoginRequestDto } from './dto/login-request.dto';

interface LoginResponse {
  token: string;
}

@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authFacade: AuthFacade) {}

  @Post('login')
  @ApiOperation({ summary: 'Login through auth-service gRPC' })
  @ApiOkResponse({ description: 'JWT token returned.' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials.' })
  login(@Body() body: LoginRequestDto): Promise<LoginResponse> {
    return this.authFacade.login(body);
  }

  @Get('validate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Validate bearer token through auth-service gRPC' })
  @ApiOkResponse({ description: 'Authenticated user returned.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  validate(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
