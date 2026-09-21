import { createHash } from 'node:crypto';

export const CURRENT_CHECKOUT_HASH_VERSION = 2;

export interface CheckoutHashItem {
  productSkuId: bigint;
  productName: string;
  skuCode: string;
  imageUrl?: string | null;
  price: number;
  quantity: number;
  priceSource?: string;
  regularPrice?: number;
  flashSaleId?: bigint | null;
  flashSaleItemId?: bigint | null;
  saleEndsAt?: Date | string | null;
}

export interface CheckoutHashInput {
  userId: bigint;
  cartId: bigint;
  items: readonly CheckoutHashItem[];
}

export function serializeCheckoutRequest(input: CheckoutHashInput, version = 1): string {
  if (version !== 1 && version !== 2) {
    throw new RangeError(`Unsupported checkout request hash version: ${version}.`);
  }

  const items = [...input.items]
    .sort((left, right) => {
      if (left.productSkuId < right.productSkuId) return -1;
      if (left.productSkuId > right.productSkuId) return 1;
      return 0;
    })
    .map((item) => {
      const baseItem = {
        productSkuId: item.productSkuId.toString(),
        productName: item.productName,
        skuCode: item.skuCode,
        imageUrl: item.imageUrl ?? null,
        price: formatPrice(item.price),
        quantity: item.quantity,
      };

      if (version === 1) return baseItem;
      if (!item.priceSource || item.regularPrice == null) {
        throw new RangeError('Version 2 checkout items require priceSource and regularPrice.');
      }

      return {
        ...baseItem,
        priceSource: item.priceSource,
        regularPrice: formatPrice(item.regularPrice),
        flashSaleId: item.flashSaleId?.toString() ?? null,
        flashSaleItemId: item.flashSaleItemId?.toString() ?? null,
        saleEndsAt: formatTimestamp(item.saleEndsAt),
      };
    });

  return JSON.stringify({
    version,
    userId: input.userId.toString(),
    cartId: input.cartId.toString(),
    items,
  });
}

export function hashCheckoutRequest(input: CheckoutHashInput, version = 1): string {
  return createHash('sha256')
    .update(serializeCheckoutRequest(input, version), 'utf8')
    .digest('hex');
}

function formatPrice(price: number): string {
  const rounded = Math.round(price * 100) / 100;
  if (!Number.isFinite(rounded) || price < 0 || price >= 1e21 || rounded >= 1e21) {
    throw new RangeError('Checkout price must be non-negative and support fixed decimal notation.');
  }
  return rounded.toFixed(2);
}

function formatTimestamp(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Checkout saleEndsAt must be a valid timestamp.');
  }
  return date.toISOString();
}
