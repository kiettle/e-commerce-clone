import { Module } from '@nestjs/common';
import { AuthFacade } from './application/auth.facade';
import { AuthGrpcClient } from './infrastructure/grpc/auth-grpc.client';
import { AuthController } from './presentation/http/auth.controller';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthFacade, AuthGrpcClient, JwtAuthGuard],
  exports: [AuthFacade, JwtAuthGuard],
})
export class AuthModule {}
