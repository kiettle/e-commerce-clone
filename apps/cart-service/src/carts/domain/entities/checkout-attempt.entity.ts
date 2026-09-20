import { CheckoutStatus } from '../enums/checkout-status.enum';
import { ReconciliationAction } from '../enums/reconciliation-action.enum';

export interface CheckoutItemSnapshot {
  productSkuId: string;
  productName: string;
  skuCode: string;
  imageUrl: string | null;
  price: string;
  quantity: number;
}

export interface CheckoutAttemptEntityProps {
  id: string;
  userId: bigint;
  cartId: bigint;
  idempotencyKey: string;
  requestHash: string;
  itemsSnapshot: CheckoutItemSnapshot[];
  status: CheckoutStatus;
  orderId?: bigint | null;
  retryCount?: number;
  lastError?: string | null;
  reconciliationAction?: ReconciliationAction | null;
  createdAt: Date;
  updatedAt: Date;
}

export class CheckoutAttemptEntity {
  readonly id: string;
  readonly userId: bigint;
  readonly cartId: bigint;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly itemsSnapshot: CheckoutItemSnapshot[];
  readonly status: CheckoutStatus;
  readonly orderId: bigint | null;
  readonly retryCount: number;
  readonly lastError: string | null;
  readonly reconciliationAction: ReconciliationAction | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: CheckoutAttemptEntityProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.cartId = props.cartId;
    this.idempotencyKey = props.idempotencyKey;
    this.requestHash = props.requestHash;
    this.itemsSnapshot = props.itemsSnapshot;
    this.status = props.status;
    this.orderId = props.orderId ?? null;
    this.retryCount = props.retryCount ?? 0;
    this.lastError = props.lastError ?? null;
    this.reconciliationAction = props.reconciliationAction ?? null;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
