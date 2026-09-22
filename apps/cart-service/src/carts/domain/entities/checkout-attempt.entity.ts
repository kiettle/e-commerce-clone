import { CheckoutStatus } from '../enums/checkout-status.enum';
import { ReconciliationAction } from '../enums/reconciliation-action.enum';

export interface CheckoutItemSnapshot {
  productSkuId: string;
  productName: string;
  skuCode: string;
  imageUrl: string | null;
  price: string;
  quantity: number;
  priceSource?: string;
  regularPrice?: string;
  flashSaleId?: string | null;
  flashSaleItemId?: string | null;
  saleEndsAt?: string | null;
}

export interface CheckoutAttemptEntityProps {
  id: string;
  userId: bigint;
  cartId: bigint;
  idempotencyKey: string;
  requestHash: string;
  requestHashVersion?: number;
  itemsSnapshot: CheckoutItemSnapshot[];
  status: CheckoutStatus;
  orderId?: bigint | null;
  retryCount?: number;
  nextRetryAt?: Date | null;
  lastError?: string | null;
  reconciliationAction?: ReconciliationAction | null;
  leaseOwner?: string | null;
  leaseUntil?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class CheckoutAttemptEntity {
  readonly id: string;
  readonly userId: bigint;
  readonly cartId: bigint;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly requestHashVersion: number;
  readonly itemsSnapshot: CheckoutItemSnapshot[];
  readonly status: CheckoutStatus;
  readonly orderId: bigint | null;
  readonly retryCount: number;
  readonly nextRetryAt: Date | null;
  readonly lastError: string | null;
  readonly reconciliationAction: ReconciliationAction | null;
  readonly leaseOwner: string | null;
  readonly leaseUntil: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: CheckoutAttemptEntityProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.cartId = props.cartId;
    this.idempotencyKey = props.idempotencyKey;
    this.requestHash = props.requestHash;
    this.requestHashVersion = props.requestHashVersion ?? 1;
    this.itemsSnapshot = props.itemsSnapshot;
    this.status = props.status;
    this.orderId = props.orderId ?? null;
    this.retryCount = props.retryCount ?? 0;
    this.nextRetryAt = props.nextRetryAt ?? null;
    this.lastError = props.lastError ?? null;
    this.reconciliationAction = props.reconciliationAction ?? null;
    this.leaseOwner = props.leaseOwner ?? null;
    this.leaseUntil = props.leaseUntil ?? null;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
