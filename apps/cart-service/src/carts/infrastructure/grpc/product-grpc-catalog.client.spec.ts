import { status as GrpcStatus } from '@grpc/grpc-js';
import { ConfigService } from '@nestjs/config';
import { Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ProductSnapshotUnavailableError } from '../../domain/errors/product-snapshot-unavailable.error';
import { ProductGrpcCatalogClient } from './product-grpc-catalog.client';

interface SnapshotResponse {
  product_id: string;
  product_name: string;
  image_url?: string;
  product_sku_id: string;
  sku_code: string;
  regular_price: number;
  effective_price: number;
  price_source: 'REGULAR' | 'FLASH_SALE';
  flash_sale_id?: string;
  flash_sale_item_id?: string;
  sale_ends_at?: string;
  max_quantity_per_user?: number;
}

describe('ProductGrpcCatalogClient', () => {
  it('maps the complete effective-price snapshot without losing int64 IDs', async () => {
    const getProductSkuSnapshot = vi.fn().mockReturnValue(
      of({
        product_id: '9007199254740993',
        product_name: 'Sale Keyboard',
        product_sku_id: '9007199254740995',
        sku_code: 'SALE-SKU',
        regular_price: 49.9,
        effective_price: 29.9,
        price_source: 'FLASH_SALE',
        flash_sale_id: '9007199254740997',
        flash_sale_item_id: '9007199254740999',
        sale_ends_at: '2026-09-30T10:00:00.000Z',
        max_quantity_per_user: 1,
      } satisfies SnapshotResponse),
    );
    const client = clientWith(getProductSkuSnapshot);

    await expect(client.getProductSkuSnapshot(9_007_199_254_740_995n)).resolves.toEqual({
      productId: 9_007_199_254_740_993n,
      productName: 'Sale Keyboard',
      imageUrl: null,
      productSkuId: 9_007_199_254_740_995n,
      skuCode: 'SALE-SKU',
      price: 29.9,
      regularPrice: 49.9,
      priceSource: 'FLASH_SALE',
      flashSaleId: 9_007_199_254_740_997n,
      flashSaleItemId: 9_007_199_254_740_999n,
      saleEndsAt: new Date('2026-09-30T10:00:00.000Z'),
      maxPerUserQuantity: 1,
    });
    expect(getProductSkuSnapshot).toHaveBeenCalledWith(
      {
        product_sku_id: '9007199254740995',
      },
      expect.anything(),
      expect.objectContaining({ deadline: expect.any(Date) }),
    );
  });

  it('returns null for a missing SKU and treats transport errors as unavailable', async () => {
    const missing = clientWith(() =>
      throwError(() => ({ code: GrpcStatus.NOT_FOUND, details: 'not found' })),
    );
    await expect(missing.getProductSkuSnapshot(999n)).resolves.toBeNull();

    const unavailable = clientWith(() =>
      throwError(() => ({ code: GrpcStatus.UNAVAILABLE, details: 'offline' })),
    );
    await expect(unavailable.getProductSkuSnapshot(999n)).rejects.toBeInstanceOf(
      ProductSnapshotUnavailableError,
    );
  });
});

function clientWith(
  getProductSkuSnapshot: (request: { product_sku_id: string }) => Observable<SnapshotResponse>,
): ProductGrpcCatalogClient {
  const client = new ProductGrpcCatalogClient({ get: vi.fn() } as unknown as ConfigService);
  (
    client as unknown as {
      productService: { getProductSkuSnapshot: typeof getProductSkuSnapshot };
    }
  ).productService = { getProductSkuSnapshot };
  return client;
}
