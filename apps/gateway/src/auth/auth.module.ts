import { Module } from '@nestjs/common';
import { AuthFacade } from './application/auth.facade';
import { AuthGrpcClient } from './infrastructure/grpc/auth-grpc.client';
import { AuthController } from './presentation/http/auth.controller';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthFacade, AuthGrpcClient, JwtAuthGuard, RolesGuard],
  exports: [AuthFacade, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
