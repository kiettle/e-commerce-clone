import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../../../../../prisma/generated/auth';

@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  constructor(configService: ConfigService) {
    const databaseUrl = configService.get<string>('AUTH_DATABASE_URL');

    if (!databaseUrl) {
      throw new Error('AUTH_DATABASE_URL is required for auth-service.');
    }

    super({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
