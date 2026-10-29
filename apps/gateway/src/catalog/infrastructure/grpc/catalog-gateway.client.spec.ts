import { ConflictException, NotFoundException } from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CatalogGatewayClient } from './catalog-gateway.client';

describe('CatalogGatewayClient', () => {
  it('returns an empty list when protobuf omits the empty products field', async () => {
    const client = clientWith({ searchProducts: () => of({}) });
    await expect(client.searchProducts({ name: 'missing' })).resolves.toEqual([]);
  });

  it('maps public product queries to the internal gRPC contract', async () => {
    const searchProducts = vi.fn().mockReturnValue(
      of({
        products: [
          {
            id: '10',
            name: 'Keyboard',
            category_id: '2',
            seller_id: '3',
            status: 'ACTIVE',
            skus: [
              {
                id: '11',
                product_id: '10',
                sku_code: 'KEYBOARD-BLACK',
                price: 79.9,
                status: 'AVAILABLE',
              },
            ],
          },
        ],
      }),
    );
    const client = clientWith({ searchProducts });

    await expect(client.searchProducts({ name: 'Key', categoryId: 2 })).resolves.toEqual([
      {
        id: 10,
        name: 'Keyboard',
        description: null,
        imageUrl: null,
        categoryId: 2,
        sellerId: 3,
        status: 'ACTIVE',
        skus: [
          {
            id: 11,
            productId: 10,
            skuCode: 'KEYBOARD-BLACK',
            price: 79.9,
            status: 'AVAILABLE',
          },
        ],
      },
    ]);
    expect(searchProducts).toHaveBeenCalledWith({ name: 'Key', category_id: '2' });
  });

  it('preserves structured business errors when mapping gRPC statuses to HTTP', async () => {
    const notFound = clientWith({
      deleteProduct: () =>
        throwError(() => ({ code: GrpcStatus.NOT_FOUND, details: 'Product 99 was not found.' })),
    });
    await expect(notFound.deleteProduct(99)).rejects.toBeInstanceOf(NotFoundException);

    const conflict = clientWith({
      scheduleFlashSale: () =>
        throwError(() => ({
          code: GrpcStatus.FAILED_PRECONDITION,
          details: JSON.stringify({
            code: 'FLASH_SALE_NOT_SCHEDULABLE',
            message: 'The flash sale is not a draft.',
          }),
        })),
    });
    await expect(conflict.scheduleFlashSale(20)).rejects.toMatchObject({
      response: {
        code: 'FLASH_SALE_NOT_SCHEDULABLE',
        message: 'The flash sale is not a draft.',
      },
    } satisfies Partial<ConflictException>);
  });
});

function clientWith(service: Record<string, unknown>): CatalogGatewayClient {
  const client = new CatalogGatewayClient({ get: vi.fn() } as unknown as ConfigService);
  (client as unknown as { productService: Record<string, unknown> }).productService = service;
  return client;
}
