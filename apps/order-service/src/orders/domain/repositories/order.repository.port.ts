import { OrderEntity } from '../entities/order.entity';
import { OrderStatus } from '../enums/order-status.enum';
import { PaymentStatus } from '../enums/payment-status.enum';

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

export interface OrderItemCreateData {
  productName: string;
  productSkuId: bigint;
  skuCode: string;
  imageUrl?: string | null;
  price: number;
  quantity: number;
}

export interface OrderCreateData {
  userId: bigint;
  checkoutId?: string;
  cartId?: bigint;
  requestHash?: string;
  totalAmount: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  shippingAddress?: string | null;
  items: OrderItemCreateData[];
}

export interface OrderRepositoryPort {
  create(data: OrderCreateData): Promise<OrderEntity>;
}
