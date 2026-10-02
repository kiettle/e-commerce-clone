import { ProductSkuStatus } from '../enums/product-sku-status.enum';

export interface ProductSkuEntityProps {
  id: bigint;
  productId: bigint;
  skuCode: string;
  price: number;
  status: ProductSkuStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export class ProductSkuEntity {
  readonly id: bigint;
  readonly productId: bigint;
  readonly skuCode: string;
  readonly price: number;
  readonly status: ProductSkuStatus;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;

  constructor(props: ProductSkuEntityProps) {
    this.id = props.id;
    this.productId = props.productId;
    this.skuCode = props.skuCode;
    this.price = props.price;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
