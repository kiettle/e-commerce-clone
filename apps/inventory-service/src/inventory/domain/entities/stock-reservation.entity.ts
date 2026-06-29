import { StockReservationStatus } from '../enums/stock-reservation-status.enum';

export interface StockReservationEntityProps {
  id: bigint;
  cartId: bigint;
  productSkuId: bigint;
  quantity: number;
  status: StockReservationStatus;
  createdAt?: Date;
  updatedAt?: Date;
  releasedAt?: Date | null;
}

export class StockReservationEntity {
  readonly id: bigint;
  readonly cartId: bigint;
  readonly productSkuId: bigint;
  readonly quantity: number;
  readonly status: StockReservationStatus;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
  readonly releasedAt?: Date | null;

  constructor(props: StockReservationEntityProps) {
    this.id = props.id;
    this.cartId = props.cartId;
    this.productSkuId = props.productSkuId;
    this.quantity = props.quantity;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.releasedAt = props.releasedAt;
  }
}
