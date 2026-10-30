import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CartGatewayClient } from './infrastructure/grpc/cart-gateway.client';
import { CartItemsGatewayController } from './presentation/http/cart-items-gateway.controller';
import { CartsGatewayController } from './presentation/http/carts-gateway.controller';
import { CheckoutsGatewayController } from './presentation/http/checkouts-gateway.controller';

@Module({
  imports: [AuthModule],
  controllers: [CartsGatewayController, CartItemsGatewayController, CheckoutsGatewayController],
  providers: [CartGatewayClient],
})
export class CartGatewayModule {}
