import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HttpForwardingModule } from '../common/http/http-forwarding.module';
import { CartGatewayClient } from './infrastructure/http/cart-gateway.client';
import { CartItemsGatewayController } from './presentation/http/cart-items-gateway.controller';
import { CartsGatewayController } from './presentation/http/carts-gateway.controller';

@Module({
  imports: [AuthModule, HttpForwardingModule],
  controllers: [CartsGatewayController, CartItemsGatewayController],
  providers: [CartGatewayClient],
})
export class CartGatewayModule {}

