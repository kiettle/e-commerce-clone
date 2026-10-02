import { CartStatus } from '../enums/cart-status.enum';
import { CartItemEntity } from './cart-item.entity';

export interface CartEntityProps {
  id: bigint;
  userId: bigint;
  status: CartStatus;
  items?: CartItemEntity[];
  createdAt?: Date;
  updatedAt?: Date;
}

export class CartEntity {
  readonly id: bigint;
  readonly userId: bigint;
  readonly status: CartStatus;
  readonly items: CartItemEntity[];
  readonly createdAt?: Date;
  readonly updatedAt?: Date;

  constructor(props: CartEntityProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.status = props.status;
    this.items = props.items ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  get totalAmount(): number {
    const total = this.items.reduce((sum, item) => sum + item.subtotal, 0);

    return Math.round(total * 100) / 100;
  }
}
