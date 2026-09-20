import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HttpForwardingModule } from '../common/http/http-forwarding.module';
import { CatalogGatewayClient } from './infrastructure/http/catalog-gateway.client';
import { CategoriesGatewayController } from './presentation/http/categories-gateway.controller';
import { FlashSalesGatewayController } from './presentation/http/flash-sales-gateway.controller';
import { ProductsGatewayController } from './presentation/http/products-gateway.controller';

@Module({
  imports: [AuthModule, HttpForwardingModule],
  controllers: [
    CategoriesGatewayController,
    ProductsGatewayController,
    FlashSalesGatewayController,
  ],
  providers: [CatalogGatewayClient],
})
export class CatalogGatewayModule {}
