import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { CartGatewayModule } from './cart/cart-gateway.module';
import { CatalogGatewayModule } from './catalog/catalog-gateway.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    HealthModule,
    AuthModule,
    CatalogGatewayModule,
    CartGatewayModule,
  ],
})
export class AppModule {}
