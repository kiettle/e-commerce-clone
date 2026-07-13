import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CartsModule } from './carts/carts.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    HealthModule,
    CartsModule,
  ],
})
export class AppModule {}
