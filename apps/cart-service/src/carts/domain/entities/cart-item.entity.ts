import { CartItemPriceSource } from '../enums/cart-item-price-source.enum';

export interface CartItemEntityProps {
  id: bigint;
  cartId: bigint;
  productId: bigint;
  productName: string;
  imageUrl?: string | null;
  productSkuId: bigint;
  flashSaleId?: bigint | null;
  flashSaleItemId?: bigint | null;
  skuCode: string;
  price: number;
  regularPrice: number;
  priceSource: CartItemPriceSource;
  saleEndsAt?: Date | null;
  maxPerUserQuantity?: number | null;
  quantity: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class CartItemEntity {
  readonly id: bigint;
  readonly cartId: bigint;
  readonly productId: bigint;
  readonly productName: string;
  readonly imageUrl?: string | null;
  readonly productSkuId: bigint;
  readonly flashSaleId: bigint | null;
  readonly flashSaleItemId: bigint | null;
  readonly skuCode: string;
  readonly price: number;
  readonly regularPrice: number;
  readonly priceSource: CartItemPriceSource;
  readonly saleEndsAt: Date | null;
  readonly maxPerUserQuantity: number | null;
  readonly quantity: number;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;

  constructor(props: CartItemEntityProps) {
    this.id = props.id;
    this.cartId = props.cartId;
    this.productId = props.productId;
    this.productName = props.productName;
    this.imageUrl = props.imageUrl;
    this.productSkuId = props.productSkuId;
    this.flashSaleId = props.flashSaleId ?? null;
    this.flashSaleItemId = props.flashSaleItemId ?? null;
    this.skuCode = props.skuCode;
    this.price = props.price;
    this.regularPrice = props.regularPrice;
    this.priceSource = props.priceSource;
    this.saleEndsAt = props.saleEndsAt ?? null;
    this.maxPerUserQuantity = props.maxPerUserQuantity ?? null;
    this.quantity = props.quantity;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  get subtotal(): number {
    return Math.round(this.price * this.quantity * 100) / 100;
  }
}
