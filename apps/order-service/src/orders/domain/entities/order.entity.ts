import { OrderStatus } from '../enums/order-status.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { OrderItemEntity } from './order-item.entity';

export interface OrderEntityProps {
  id: bigint;
  userId: bigint;
  checkoutId?: string | null;
  cartId?: bigint | null;
  requestHash?: string | null;
  totalAmount: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  shippingAddress?: string | null;
  items?: OrderItemEntity[];
  createdAt?: Date;
  updatedAt?: Date;
}

export class OrderEntity {
  readonly id: bigint;
  readonly userId: bigint;
  readonly checkoutId: string | null;
  readonly cartId: bigint | null;
  readonly requestHash: string | null;
  readonly totalAmount: number;
  readonly status: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  readonly shippingAddress?: string | null;
  readonly items: OrderItemEntity[];
  readonly createdAt?: Date;
  readonly updatedAt?: Date;

  constructor(props: OrderEntityProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.checkoutId = props.checkoutId ?? null;
    this.cartId = props.cartId ?? null;
    this.requestHash = props.requestHash ?? null;
    this.totalAmount = props.totalAmount;
    this.status = props.status;
    this.paymentStatus = props.paymentStatus;
    this.shippingAddress = props.shippingAddress;
    this.items = props.items ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
