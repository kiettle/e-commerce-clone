export interface OrderItemEntityProps {
  id: bigint;
  orderId: bigint;
  productName: string;
  productSkuId: bigint;
  skuCode: string;
  imageUrl?: string | null;
  price: number;
  quantity: number;
  regularPrice?: number | null;
  priceSource?: string | null;
  flashSaleId?: bigint | null;
  flashSaleItemId?: bigint | null;
  saleEndsAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class OrderItemEntity {
  readonly id: bigint;
  readonly orderId: bigint;
  readonly productName: string;
  readonly productSkuId: bigint;
  readonly skuCode: string;
  readonly imageUrl?: string | null;
  readonly price: number;
  readonly quantity: number;
  readonly regularPrice: number | null;
  readonly priceSource: string | null;
  readonly flashSaleId: bigint | null;
  readonly flashSaleItemId: bigint | null;
  readonly saleEndsAt: Date | null;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;

  constructor(props: OrderItemEntityProps) {
    this.id = props.id;
    this.orderId = props.orderId;
    this.productName = props.productName;
    this.productSkuId = props.productSkuId;
    this.skuCode = props.skuCode;
    this.imageUrl = props.imageUrl;
    this.price = props.price;
    this.quantity = props.quantity;
    this.regularPrice = props.regularPrice ?? null;
    this.priceSource = props.priceSource ?? null;
    this.flashSaleId = props.flashSaleId ?? null;
    this.flashSaleItemId = props.flashSaleItemId ?? null;
    this.saleEndsAt = props.saleEndsAt ?? null;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
