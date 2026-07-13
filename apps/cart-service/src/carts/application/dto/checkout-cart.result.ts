import { CartEntity } from '../../domain/entities/cart.entity';

export interface CheckoutCartResult {
  cart: CartEntity;
  orderId: bigint;
}
