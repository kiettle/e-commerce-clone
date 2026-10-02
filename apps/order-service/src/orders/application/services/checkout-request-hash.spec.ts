import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  hashCheckoutRequest,
  serializeCheckoutRequest,
  type CheckoutHashItem,
} from './checkout-request-hash';

describe('order checkout request hash', () => {
  const fixture = JSON.parse(
    readFileSync(join(process.cwd(), 'libs/proto/test-fixtures/checkout-hash-v2.json'), 'utf8'),
  ) as {
    input: Record<string, unknown> & { items: Array<Record<string, unknown>> };
    canonicalJson: string;
    sha256: string;
  };

  const input = {
    userId: BigInt(fixture.input.userId as string),
    cartId: BigInt(fixture.input.cartId as string),
    items: fixture.input.items.map((item) => ({
      ...item,
      productSkuId: BigInt(item.productSkuId as string),
      flashSaleId: BigInt(item.flashSaleId as string),
      flashSaleItemId: BigInt(item.flashSaleItemId as string),
    })) as CheckoutHashItem[],
  };

  const versionOneInput = {
    userId: 10n,
    cartId: 20n,
    items: [
      {
        productSkuId: 100n,
        productName: 'Example',
        skuCode: 'SKU-100',
        imageUrl: null,
        price: 19.9,
        quantity: 2,
      },
    ],
  };

  it('keeps the fixed version 1 fixture stable for existing attempts', () => {
    expect(serializeCheckoutRequest(versionOneInput, 1)).toBe(
      '{"version":1,"userId":"10","cartId":"20","items":[{"productSkuId":"100","productName":"Example","skuCode":"SKU-100","imageUrl":null,"price":"19.90","quantity":2}]}',
    );
    expect(hashCheckoutRequest(versionOneInput, 1)).toBe(
      'c01f8b8c46084ffabc8890af149236c50d4b040a4ea67acc538f72e98f7c44d3',
    );
  });

  it('uses the same version 2 fixture as cart-service', () => {
    expect(serializeCheckoutRequest(input, 2)).toBe(fixture.canonicalJson);
    expect(hashCheckoutRequest(input, 2)).toBe(fixture.sha256);
  });

  it('includes sale context in idempotency', () => {
    for (const change of [
      { priceSource: 'REGULAR' },
      { regularPrice: 40 },
      { flashSaleId: 11n },
      { flashSaleItemId: 502n },
      { saleEndsAt: '2026-09-20T05:00:00.000Z' },
    ]) {
      expect(
        hashCheckoutRequest({ ...input, items: [{ ...input.items[0], ...change }] }, 2),
      ).not.toBe(fixture.sha256);
    }
  });

  it('rejects unknown versions', () => {
    expect(() => hashCheckoutRequest(input, 99)).toThrow(
      'Unsupported checkout request hash version: 99.',
    );
  });
});
