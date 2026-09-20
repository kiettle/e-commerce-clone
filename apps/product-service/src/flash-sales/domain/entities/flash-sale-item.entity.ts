import { InvalidFlashSaleError } from '../errors/invalid-flash-sale.error';

export interface FlashSaleItemEntityProps {
  id?: bigint;
  flashSaleId?: bigint;
  productSkuId: bigint;
  originalPrice: number;
  salePrice: number;
  quantity: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class FlashSaleItemEntity {
  readonly id?: bigint;
  readonly flashSaleId?: bigint;
  readonly productSkuId: bigint;
  readonly originalPrice: number;
  readonly salePrice: number;
  readonly quantity: number;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;

  constructor(props: FlashSaleItemEntityProps) {
    if (props.productSkuId <= 0n) {
      throw new InvalidFlashSaleError('Product SKU ID must be positive.');
    }
    if (!Number.isFinite(props.originalPrice) || props.originalPrice <= 0) {
      throw new InvalidFlashSaleError('Original price must be positive.');
    }
    if (
      !Number.isFinite(props.salePrice) ||
      props.salePrice <= 0 ||
      props.salePrice >= props.originalPrice
    ) {
      throw new InvalidFlashSaleError(
        'Sale price must be positive and lower than the regular price.',
      );
    }
    if (!Number.isInteger(props.quantity) || props.quantity <= 0) {
      throw new InvalidFlashSaleError('Quantity must be a positive integer.');
    }

    this.id = props.id;
    this.flashSaleId = props.flashSaleId;
    this.productSkuId = props.productSkuId;
    this.originalPrice = props.originalPrice;
    this.salePrice = props.salePrice;
    this.quantity = props.quantity;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
