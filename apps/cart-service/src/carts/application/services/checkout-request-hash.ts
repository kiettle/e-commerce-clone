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

/** Version 1 canonical JSON. Callers supply validated cart items with unique SKU IDs. */
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

  // Construct fields explicitly: their order is part of the hash contract.
  return JSON.stringify({
    version: 1,
    userId: input.userId.toString(),
    cartId: input.cartId.toString(),
    items,
  });
}

export function hashCheckoutRequest(input: CheckoutHashInput): string {
  return createHash('sha256').update(serializeCheckoutRequest(input), 'utf8').digest('hex');
}

function formatPrice(price: number): string {
  // Match the existing order use case's rounding before formatting trailing zeroes.
  const rounded = Math.round(price * 100) / 100;
  // toFixed uses exponential notation at 1e21; check both sides of rounding.
  if (!Number.isFinite(rounded) || price < 0 || price >= 1e21 || rounded >= 1e21) {
    throw new RangeError('Checkout price must be non-negative and support fixed decimal notation.');
  }
  return rounded.toFixed(2);
}
