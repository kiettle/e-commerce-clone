import { describe, expect, it } from 'vitest';
import {
  hashCheckoutRequest,
  serializeCheckoutRequest,
  type CheckoutHashInput,
} from './checkout-request-hash';

describe('order checkout request hash', () => {
  const input: CheckoutHashInput = {
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

  it('matches the fixed version 1 JSON and SHA-256 fixture', () => {
    expect(serializeCheckoutRequest(input)).toBe(
      '{"version":1,"userId":"10","cartId":"20","items":[{"productSkuId":"100","productName":"Example","skuCode":"SKU-100","imageUrl":null,"price":"19.90","quantity":2}]}',
    );
    expect(hashCheckoutRequest(input)).toBe(
      'c01f8b8c46084ffabc8890af149236c50d4b040a4ea67acc538f72e98f7c44d3',
    );
  });

  it('sorts items numerically by SKU ID', () => {
    const reversed = {
      ...input,
      items: [
        { ...input.items[0], productSkuId: 100n },
        { ...input.items[0], productSkuId: 20n },
      ],
    };

    expect(JSON.parse(serializeCheckoutRequest(reversed))).toMatchObject({
      items: [{ productSkuId: '20' }, { productSkuId: '100' }],
    });
  });
});
