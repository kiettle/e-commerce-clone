import { InvalidFlashSaleError } from '../errors/invalid-flash-sale.error';

export interface FlashSaleItemEntityProps {
  id?: bigint;
  flashSaleId?: bigint;
  productSkuId: bigint;
  originalPrice: number;
  salePrice: number;
  stockLimit: number;
  maxQuantityPerUser?: number;
  productName?: string;
  imageUrl?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class FlashSaleItemEntity {
  readonly id?: bigint;
  readonly flashSaleId?: bigint;
  readonly productSkuId: bigint;
  readonly originalPrice: number;
  readonly salePrice: number;
  readonly stockLimit: number;
  readonly maxQuantityPerUser: number;
  readonly productName?: string;
  readonly imageUrl?: string | null;
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
        'FLASH_SALE_PRICE_INVALID',
      );
    }
    if (!Number.isInteger(props.stockLimit) || props.stockLimit <= 0) {
      throw new InvalidFlashSaleError('Stock limit must be a positive integer.');
    }
    const maxQuantityPerUser = props.maxQuantityPerUser ?? 1;
    if (maxQuantityPerUser !== 1) {
      throw new InvalidFlashSaleError('Maximum quantity per user must be exactly one.');
    }

    this.id = props.id;
    this.flashSaleId = props.flashSaleId;
    this.productSkuId = props.productSkuId;
    this.originalPrice = props.originalPrice;
    this.salePrice = props.salePrice;
    this.stockLimit = props.stockLimit;
    this.maxQuantityPerUser = maxQuantityPerUser;
    this.productName = props.productName;
    this.imageUrl = props.imageUrl;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
