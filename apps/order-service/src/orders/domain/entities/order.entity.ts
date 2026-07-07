import { OrderStatus } from '../enums/order-status.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { OrderItemEntity } from './order-item.entity';

export interface OrderEntityProps {
  id: bigint;
  userId: bigint;
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
    this.totalAmount = props.totalAmount;
    this.status = props.status;
    this.paymentStatus = props.paymentStatus;
    this.shippingAddress = props.shippingAddress;
    this.items = props.items ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
