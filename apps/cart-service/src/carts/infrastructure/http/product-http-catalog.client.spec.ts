import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductHttpCatalogClient } from './product-http-catalog.client';

describe('ProductHttpCatalogClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches one internal SKU snapshot and uses its effective flash-sale price', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          productId: '10',
          productName: 'Keyboard',
          imageUrl: null,
          productSkuId: '101',
          skuCode: 'KB-BLACK',
          regularPrice: 100,
          effectivePrice: 75,
          priceSource: 'FLASH_SALE',
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new ProductHttpCatalogClient(config());

    await expect(client.getProductSkuSnapshot(101n)).resolves.toEqual({
      productId: 10n,
      productName: 'Keyboard',
      imageUrl: null,
      productSkuId: 101n,
      skuCode: 'KB-BLACK',
      price: 75,
      regularPrice: 100,
      priceSource: 'FLASH_SALE',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://product-service:4001/internal/product-skus/101/snapshot',
    );
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/products'));
  });

  it('returns null when the SKU snapshot is absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    await expect(
      new ProductHttpCatalogClient(config()).getProductSkuSnapshot(999n),
    ).resolves.toBeNull();
  });
});

function config(): ConfigService {
  return {
    get: vi.fn((name: string) =>
      name === 'PRODUCT_SERVICE_URL' ? 'http://product-service:4001/' : undefined,
    ),
  } as unknown as ConfigService;
}
