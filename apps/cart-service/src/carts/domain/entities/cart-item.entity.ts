export interface CartItemEntityProps {
  id: bigint;
  cartId: bigint;
  productId: bigint;
  productName: string;
  imageUrl?: string | null;
  productSkuId: bigint;
  skuCode: string;
  price: number;
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
  readonly skuCode: string;
  readonly price: number;
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
    this.skuCode = props.skuCode;
    this.price = props.price;
    this.quantity = props.quantity;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  get subtotal(): number {
    return Math.round(this.price * this.quantity * 100) / 100;
  }
}
