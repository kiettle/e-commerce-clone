import { describe, expect, it } from 'vitest';
import { HandleProductCreatedCommand } from '../dto/handle-product-created.command';
import { calculateProductCreatedPayloadHash } from './product-created-payload-hash';

describe('calculateProductCreatedPayloadHash', () => {
  it('matches the fixed canonical payload fixture', () => {
    const event: HandleProductCreatedCommand = {
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      schemaVersion: 1,
      productId: 100n,
      name: 'Wireless Keyboard',
      skus: [
        {
          productSkuId: 1001n,
          skuCode: 'KB-BLACK',
          status: 'AVAILABLE',
          quantity: 50,
        },
      ],
    };

    expect(calculateProductCreatedPayloadHash(event)).toBe(
      'd3234c9025391e2364fe9e770d46f3e22dac7d5f6aba810c94b5a80ca8736f56',
    );
  });

  it('sorts SKUs by product SKU ID before hashing', () => {
    const event = productEvent();

    expect(calculateProductCreatedPayloadHash(event)).toBe(
      calculateProductCreatedPayloadHash({ ...event, skus: [...event.skus].reverse() }),
    );
  });
});

function productEvent(): HandleProductCreatedCommand {
  return {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    schemaVersion: 1,
    productId: 100n,
    name: 'Wireless Keyboard',
    skus: [
      {
        productSkuId: 1002n,
        skuCode: 'KB-WHITE',
        status: 'AVAILABLE',
        quantity: 25,
      },
      {
        productSkuId: 1001n,
        skuCode: 'KB-BLACK',
        status: 'AVAILABLE',
        quantity: 50,
      },
    ],
  };
}
