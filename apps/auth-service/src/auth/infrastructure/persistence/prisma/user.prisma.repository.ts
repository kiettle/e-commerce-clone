import { Injectable } from '@nestjs/common';
import { User as PrismaUser } from '../../../../../../../prisma/generated/auth';
import { UserEntity } from '../../../domain/entities/user.entity';
import { UserRepositoryPort } from '../../../domain/repositories/user.repository.port';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    return user ? this.toDomain(user) : null;
  }

  private toDomain(user: PrismaUser): UserEntity {
    return new UserEntity({
      id: user.id,
      email: user.email,
      passwordHash: user.password,
      role: user.role,
    });
  }
}
