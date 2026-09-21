import { join } from 'node:path';
import { loadSync, Message, Type } from 'protobufjs';
import { describe, expect, it } from 'vitest';
import { VERSION_1_PROTOBUF_FIXTURES } from './fixtures/v1-protobuf.fixtures';

describe('protobuf backward compatibility', () => {
  const authRoot = loadSync(join(process.cwd(), 'libs/proto/auth.proto'));
  const inventoryRoot = loadSync(join(process.cwd(), 'libs/proto/inventory.proto'));
  const orderRoot = loadSync(join(process.cwd(), 'libs/proto/order.proto'));
  const productRoot = loadSync(join(process.cwd(), 'libs/proto/product_event.proto'));

  it('preserves auth validation field numbers and decodes a legacy response without role', () => {
    const response = authRoot.lookupType('auth.ValidateTokenResponse');
    expect(fieldNumbers(response)).toEqual({ isValid: 1, userId: 2, message: 3, role: 4 });

    const decoded = decodeFixture(response, VERSION_1_PROTOBUF_FIXTURES.authValidateTokenResponse);
    expect(decoded).toMatchObject({
      isValid: true,
      userId: '9007199254740993',
      message: 'OK',
    });
    expect(decoded).not.toHaveProperty('role');
  });

  it('decodes a legacy regular inventory request without operation or sale identity', () => {
    const decoded = decodeFixture(
      inventoryRoot.lookupType('inventory.StockOperationRequest'),
      VERSION_1_PROTOBUF_FIXTURES.regularInventoryRequest,
    );

    expect(decoded).toEqual({
      cartId: '9007199254740993',
      items: [
        {
          productSkuId: '9007199254740995',
          quantity: 2,
        },
      ],
    });
  });

  it('decodes a version-1 order request without hash-version or sale fields', () => {
    const decoded = decodeFixture(
      orderRoot.lookupType('order.CreateOrderRequest'),
      VERSION_1_PROTOBUF_FIXTURES.orderCreateRequest,
    );

    expect(decoded).toMatchObject({
      userId: '9007199254740993',
      cartId: '9007199254740997',
      checkoutId: '550e8400-e29b-41d4-a716-446655440000',
      requestHash: 'a'.repeat(64),
      items: [
        expect.objectContaining({
          productSkuId: '9007199254740995',
          productName: 'Legacy Keyboard',
          skuCode: 'LEGACY',
        }),
      ],
    });
    expect(decoded).not.toHaveProperty('requestHashVersion');
    const items = decoded.items as Array<Record<string, unknown>>;
    expect(items[0]).not.toHaveProperty('flashSaleId');
    expect(items[0]).not.toHaveProperty('flashSaleItemId');
  });

  it('decodes the stored ProductCreated schema-version-1 envelope without losing int64 IDs', () => {
    const event = productRoot.lookupType('product.events.ProductEvent');
    expect(fieldNumbers(event)).toEqual({
      eventId: 1,
      eventType: 2,
      occurredAt: 3,
      schemaVersion: 4,
      productCreated: 10,
      productSkuAdded: 11,
    });
    expect(fieldNumbers(productRoot.lookupType('product.events.ProductCreated'))).toEqual({
      productId: 1,
      name: 2,
      skus: 3,
    });

    const decoded = decodeFixture(event, VERSION_1_PROTOBUF_FIXTURES.productCreated);
    expect(decoded).toMatchObject({
      eventId: '550e8400-e29b-41d4-a716-446655440001',
      eventType: 'PRODUCT_CREATED',
      schemaVersion: 1,
      productCreated: {
        productId: '9007199254740993',
        name: 'Legacy Product',
        skus: [
          {
            productSkuId: '9007199254740995',
            skuCode: 'LEGACY-SKU',
            status: 'AVAILABLE',
            quantity: '25',
          },
        ],
      },
    });
  });

  it('round-trips current sale and hash fields while preserving maximum int64 values', () => {
    const inventoryRequest = inventoryRoot.lookupType('inventory.StockOperationRequest');
    const decodedInventory = decode(
      inventoryRequest,
      inventoryRequest.fromObject({
        cartId: '9223372036854775807',
        checkoutId: '550e8400-e29b-41d4-a716-446655440010',
        userId: '9007199254740993',
        items: [
          {
            productSkuId: '9007199254740995',
            quantity: 1,
            flashSaleId: '9007199254740997',
            flashSaleItemId: '9007199254740999',
          },
        ],
      }),
    );
    expect(decodedInventory).toMatchObject({
      cartId: '9223372036854775807',
      userId: '9007199254740993',
      items: [
        {
          productSkuId: '9007199254740995',
          quantity: 1,
          flashSaleId: '9007199254740997',
          flashSaleItemId: '9007199254740999',
        },
      ],
    });

    const orderRequest = orderRoot.lookupType('order.CreateOrderRequest');
    const decodedOrder = decode(
      orderRequest,
      orderRequest.fromObject({
        userId: '9007199254740993',
        checkoutId: '550e8400-e29b-41d4-a716-446655440011',
        cartId: '9223372036854775807',
        requestHash: 'b'.repeat(64),
        requestHashVersion: 2,
        items: [
          {
            productSkuId: '9007199254740995',
            productName: 'Sale Keyboard',
            price: 19.9,
            quantity: 1,
            skuCode: 'SALE-SKU',
            regularPrice: 39.9,
            priceSource: 'FLASH_SALE',
            flashSaleId: '9007199254740997',
            flashSaleItemId: '9007199254740999',
          },
        ],
      }),
    );
    expect(decodedOrder).toMatchObject({
      userId: '9007199254740993',
      cartId: '9223372036854775807',
      requestHashVersion: 2,
      items: [
        expect.objectContaining({
          productSkuId: '9007199254740995',
          flashSaleId: '9007199254740997',
          flashSaleItemId: '9007199254740999',
        }),
      ],
    });
  });
});

function decodeFixture(type: Type, base64: string): Record<string, unknown> {
  return decode(type, type.decode(Buffer.from(base64, 'base64')));
}

function decode(type: Type, message: Message): Record<string, unknown> {
  return type.toObject(message, {
    longs: String,
    enums: String,
  }) as Record<string, unknown>;
}

function fieldNumbers(type: Type): Record<string, number> {
  return Object.fromEntries(Object.entries(type.fields).map(([name, field]) => [name, field.id]));
}
