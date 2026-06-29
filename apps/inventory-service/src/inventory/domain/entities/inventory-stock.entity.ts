import { InventoryStockStatus } from '../enums/inventory-stock-status.enum';

export interface InventoryStockEntityProps {
  id: bigint;
  productId: bigint;
  productSkuId: bigint;
  skuCode: string;
  status: InventoryStockStatus;
  availableQuantity: number;
  reservedQuantity: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class InventoryStockEntity {
  readonly id: bigint;
  readonly productId: bigint;
  readonly productSkuId: bigint;
  readonly skuCode: string;
  readonly status: InventoryStockStatus;
  readonly availableQuantity: number;
  readonly reservedQuantity: number;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;

  constructor(props: InventoryStockEntityProps) {
    this.id = props.id;
    this.productId = props.productId;
    this.productSkuId = props.productSkuId;
    this.skuCode = props.skuCode;
    this.status = props.status;
    this.availableQuantity = props.availableQuantity;
    this.reservedQuantity = props.reservedQuantity;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
