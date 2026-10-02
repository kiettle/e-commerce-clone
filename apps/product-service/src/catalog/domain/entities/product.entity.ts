import { ProductStatus } from '../enums/product-status.enum';
import { ProductSkuEntity } from './product-sku.entity';

export interface ProductEntityProps {
  id: bigint;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  categoryId: bigint;
  sellerId: bigint;
  status: ProductStatus;
  skus?: ProductSkuEntity[];
  createdAt?: Date;
  updatedAt?: Date;
}

export class ProductEntity {
  readonly id: bigint;
  readonly name: string;
  readonly description?: string | null;
  readonly imageUrl?: string | null;
  readonly categoryId: bigint;
  readonly sellerId: bigint;
  readonly status: ProductStatus;
  readonly skus: ProductSkuEntity[];
  readonly createdAt?: Date;
  readonly updatedAt?: Date;

  constructor(props: ProductEntityProps) {
    this.id = props.id;
    this.name = props.name;
    this.description = props.description;
    this.imageUrl = props.imageUrl;
    this.categoryId = props.categoryId;
    this.sellerId = props.sellerId;
    this.status = props.status;
    this.skus = props.skus ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
