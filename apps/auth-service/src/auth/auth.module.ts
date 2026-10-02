import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UserRepositoryPort, USER_REPOSITORY } from './domain/repositories/user.repository.port';
import { PasswordHasherPort, PASSWORD_HASHER } from './application/ports/password-hasher.port';
import { TokenServicePort, TOKEN_SERVICE } from './application/ports/token.service.port';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { ValidateTokenUseCase } from './application/use-cases/validate-token.use-case';
import { PrismaService } from './infrastructure/persistence/prisma/prisma.service';
import { PrismaUserRepository } from './infrastructure/persistence/prisma/user.prisma.repository';
import { BcryptPasswordHasher } from './infrastructure/security/bcrypt-password-hasher';
import { JwtTokenService } from './infrastructure/security/jwt-token.service';
import { AuthGrpcController } from './presentation/grpc/auth.grpc.controller';
import { AuthHttpController } from './presentation/http/auth.controller';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthHttpController, AuthGrpcController],
  providers: [
    PrismaService,
    {
      provide: USER_REPOSITORY,
      useClass: PrismaUserRepository,
    },
    {
      provide: PASSWORD_HASHER,
      useClass: BcryptPasswordHasher,
    },
    {
      provide: TOKEN_SERVICE,
      useClass: JwtTokenService,
    },
    {
      provide: LoginUseCase,
      useFactory: (
        users: UserRepositoryPort,
        passwordHasher: PasswordHasherPort,
        tokenService: TokenServicePort,
      ) => new LoginUseCase(users, passwordHasher, tokenService),
      inject: [USER_REPOSITORY, PASSWORD_HASHER, TOKEN_SERVICE],
    },
    {
      provide: ValidateTokenUseCase,
      useFactory: (tokenService: TokenServicePort) => new ValidateTokenUseCase(tokenService),
      inject: [TOKEN_SERVICE],
    },
  ],
})
export class AuthModule {}
