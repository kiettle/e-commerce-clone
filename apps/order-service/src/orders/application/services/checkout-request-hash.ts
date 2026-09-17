import { createHash } from 'node:crypto';

export interface CheckoutHashItem {
  productSkuId: bigint;
  productName: string;
  skuCode: string;
  imageUrl?: string | null;
  price: number;
  quantity: number;
}

export interface CheckoutHashInput {
  userId: bigint;
  cartId: bigint;
  items: readonly CheckoutHashItem[];
}

export function serializeCheckoutRequest(input: CheckoutHashInput): string {
  const items = [...input.items]
    .sort((left, right) => {
      if (left.productSkuId < right.productSkuId) return -1;
      if (left.productSkuId > right.productSkuId) return 1;
      return 0;
    })
    .map((item) => ({
      productSkuId: item.productSkuId.toString(),
      productName: item.productName,
      skuCode: item.skuCode,
      imageUrl: item.imageUrl ?? null,
      price: formatPrice(item.price),
      quantity: item.quantity,
    }));

  return JSON.stringify({
    version: 1,
    userId: input.userId.toString(),
    cartId: input.cartId.toString(),
    items,
  });
}

export function hashCheckoutRequest(input: CheckoutHashInput): string {
  return createHash('sha256')
    .update(serializeCheckoutRequest(input), 'utf8')
    .digest('hex');
}

function formatPrice(price: number): string {
  const rounded = Math.round(price * 100) / 100;
  if (
    !Number.isFinite(rounded) ||
    price < 0 ||
    price >= 1e21 ||
    rounded >= 1e21
  ) {
    throw new RangeError(
      'Checkout price must be non-negative and support fixed decimal notation.',
    );
  }
  return rounded.toFixed(2);
}
