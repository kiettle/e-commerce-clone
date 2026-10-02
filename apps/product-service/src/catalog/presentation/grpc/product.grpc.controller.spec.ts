import { status as GrpcStatus } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { describe, expect, it, vi } from 'vitest';
import { ProductGrpcController } from './product.grpc.controller';

describe('ProductGrpcController', () => {
  it('preserves int64 identifiers when mapping catalog results', async () => {
    const controller = controllerWith({
      searchProducts: vi.fn().mockResolvedValue([
        {
          id: 9_007_199_254_740_993n,
          name: 'Large-ID Keyboard',
          description: null,
          imageUrl: null,
          categoryId: 9_007_199_254_740_995n,
          sellerId: 9_007_199_254_740_997n,
          status: 'ACTIVE',
          skus: [
            {
              id: 9_007_199_254_740_999n,
              productId: 9_007_199_254_740_993n,
              skuCode: 'LARGE-ID',
              price: 19.9,
              status: 'AVAILABLE',
            },
          ],
        },
      ]),
    });

    await expect(controller.searchProducts({})).resolves.toMatchObject({
      products: [
        {
          id: '9007199254740993',
          category_id: '9007199254740995',
          seller_id: '9007199254740997',
          skus: [{ id: '9007199254740999', product_id: '9007199254740993' }],
        },
      ],
    });
  });

  it('rejects a direct gRPC product request without SKUs', async () => {
    const createProduct = vi.fn();
    const controller = controllerWith({ createProduct });

    try {
      await controller.createProduct({
        name: 'Keyboard',
        category_id: '1',
        seller_id: '2',
        status: 'ACTIVE',
        skus: [],
      });
      throw new Error('Expected the request to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(RpcException);
      expect((error as RpcException).getError()).toEqual(
        expect.objectContaining({ code: GrpcStatus.INVALID_ARGUMENT }),
      );
      expect(createProduct).not.toHaveBeenCalled();
    }
  });
});

function controllerWith(overrides: {
  createProduct?: ReturnType<typeof vi.fn>;
  searchProducts?: ReturnType<typeof vi.fn>;
}): ProductGrpcController {
  return new ProductGrpcController(
    { execute: vi.fn() } as never,
    { execute: vi.fn() } as never,
    { execute: overrides.createProduct ?? vi.fn() } as never,
    { execute: overrides.searchProducts ?? vi.fn() } as never,
    { execute: vi.fn() } as never,
    { execute: vi.fn() } as never,
    { execute: vi.fn() } as never,
  );
}
