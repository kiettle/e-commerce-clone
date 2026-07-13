import { CartEntity } from '../entities/cart.entity';

export const CART_REPOSITORY = Symbol('CART_REPOSITORY');

export interface CartItemSnapshotData {
  productId: bigint;
  productName: string;
  imageUrl?: string | null;
  productSkuId: bigint;
  skuCode: string;
  price: number;
}

export interface CartRepositoryPort {
  getOrCreateActiveCart(userId: bigint): Promise<CartEntity>;
  findById(cartId: bigint): Promise<CartEntity | null>;
  addOrIncrementItem(
    cartId: bigint,
    item: CartItemSnapshotData,
    quantity: number,
  ): Promise<CartEntity>;
  updateItemQuantity(
    userId: bigint,
    cartItemId: bigint,
    quantity: number,
  ): Promise<CartEntity>;
  deleteItem(userId: bigint, cartItemId: bigint): Promise<CartEntity>;
  markCheckedOut(cartId: bigint): Promise<CartEntity>;
}
