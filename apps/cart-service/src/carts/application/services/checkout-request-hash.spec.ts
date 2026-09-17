import { describe, expect, it } from 'vitest';
import {
  hashCheckoutRequest,
  serializeCheckoutRequest,
  type CheckoutHashInput,
  type CheckoutHashItem,
} from './checkout-request-hash';

describe('checkout request hash', () => {
  const item: CheckoutHashItem = {
    productSkuId: 100n,
    productName: 'Example',
    skuCode: 'SKU-100',
    imageUrl: null,
    price: 19.9,
    quantity: 2,
  };
  const input: CheckoutHashInput = { userId: 10n, cartId: 20n, items: [item] };
  const canonicalJson =
    '{"version":1,"userId":"10","cartId":"20","items":[{"productSkuId":"100","productName":"Example","skuCode":"SKU-100","imageUrl":null,"price":"19.90","quantity":2}]}';
  const expectedHash = 'c01f8b8c46084ffabc8890af149236c50d4b040a4ea67acc538f72e98f7c44d3';

  it('matches the fixed version 1 JSON and SHA-256 fixture', () => {
    expect(serializeCheckoutRequest(input)).toBe(canonicalJson);
    expect(hashCheckoutRequest(input)).toBe(expectedHash);
  });

  it('hashes non-ASCII product names as UTF-8', () => {
    const unicodeInput = { ...input, items: [{ ...item, productName: 'Cà phê ☕' }] };

    expect(hashCheckoutRequest(unicodeInput)).toBe(
      '16cf0781576b3cabf705c60a665042c3d9cc50e345cc392d28be1d95bd93e83a',
    );
  });

  it('sorts SKUs numerically so item order does not change the hash', () => {
    const smallerSku = { ...item, productSkuId: 20n };
    const unsorted = { ...input, items: [item, smallerSku] };
    const sorted = { ...input, items: [smallerSku, item] };

    expect(JSON.parse(serializeCheckoutRequest(unsorted))).toMatchObject({
      items: [{ productSkuId: '20' }, { productSkuId: '100' }],
    });
    expect(hashCheckoutRequest(unsorted)).toBe(hashCheckoutRequest(sorted));
  });

  it('preserves large IDs as decimal strings and sorts without losing precision', () => {
    const largeInput = {
      userId: 9007199254740993n,
      cartId: 9007199254740995n,
      items: [
        { ...item, productSkuId: 9007199254740993n },
        { ...item, productSkuId: 9007199254740992n },
      ],
    };

    expect(JSON.parse(serializeCheckoutRequest(largeInput))).toEqual({
      version: 1,
      userId: '9007199254740993',
      cartId: '9007199254740995',
      items: [
        { ...item, productSkuId: '9007199254740992', price: '19.90' },
        { ...item, productSkuId: '9007199254740993', price: '19.90' },
      ],
    });
  });

  it('normalizes omitted and undefined image URLs to null', () => {
    const withoutImage: CheckoutHashItem = {
      productSkuId: 100n,
      productName: 'Example',
      skuCode: 'SKU-100',
      price: 19.9,
      quantity: 2,
    };

    expect(serializeCheckoutRequest({ ...input, items: [withoutImage] })).toBe(canonicalJson);
    expect(hashCheckoutRequest({ ...input, items: [withoutImage] })).toBe(expectedHash);
    expect(hashCheckoutRequest({ ...input, items: [{ ...item, imageUrl: undefined }] })).toBe(
      expectedHash,
    );
  });

  it.each([
    [0, '0.00'],
    [19, '19.00'],
    [19.9, '19.90'],
    [10.124, '10.12'],
    [10.129, '10.13'],
    [2.345, '2.35'],
  ])('formats price %s as %s using current order rounding', (price, formatted) => {
    expect(serializeCheckoutRequest({ ...input, items: [{ ...item, price }] })).toBe(
      canonicalJson.replace('"19.90"', `"${formatted}"`),
    );
  });

  it.each([Number.NaN, Infinity, -Infinity, -1, 1e21])(
    'rejects price %s that cannot represent a non-negative fixed decimal amount',
    (price) => {
      expect(() => hashCheckoutRequest({ ...input, items: [{ ...item, price }] })).toThrow(
        RangeError,
      );
    },
  );

  it('does not mutate the input array or its items', () => {
    const original = {
      ...input,
      items: [
        { ...item, price: 10.129, imageUrl: undefined },
        { ...item, productSkuId: 20n },
      ],
    };
    const before = structuredClone(original);

    hashCheckoutRequest(original);

    expect(original).toEqual(before);
  });

  const changedItems: Array<[string, Partial<CheckoutHashItem>]> = [
    ['SKU ID', { productSkuId: 101n }],
    ['product name', { productName: 'Other product' }],
    ['SKU code', { skuCode: 'OTHER' }],
    ['image URL', { imageUrl: 'https://example.com/image.png' }],
    ['price', { price: 19.91 }],
    ['quantity', { quantity: 3 }],
  ];

  it.each(changedItems)('changes the hash when the %s changes', (_field, change) => {
    expect(hashCheckoutRequest({ ...input, items: [{ ...item, ...change }] })).not.toBe(
      expectedHash,
    );
  });

  it('binds the hash to both the user and the cart', () => {
    expect(hashCheckoutRequest({ ...input, userId: 11n })).not.toBe(expectedHash);
    expect(hashCheckoutRequest({ ...input, cartId: 21n })).not.toBe(expectedHash);
  });

  it('ignores extra properties and input field order', () => {
    const reordered = {
      items: [
        {
          quantity: 2,
          price: 19.9,
          skuCode: 'SKU-100',
          productName: 'Example',
          productSkuId: 100n,
          extra: 'ignored',
        },
      ],
      cartId: 20n,
      userId: 10n,
      extra: 'ignored',
    };

    expect(serializeCheckoutRequest(reordered)).toBe(canonicalJson);
  });

  it('preserves product text exactly without trimming', () => {
    expect(
      serializeCheckoutRequest({ ...input, items: [{ ...item, productName: ' Example ' }] }),
    ).toBe(canonicalJson.replace('"Example"', '" Example "'));
  });
});
