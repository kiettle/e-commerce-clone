import { describe, expect, it } from 'vitest';
import { FlashSaleItemEntity } from '../../domain/entities/flash-sale-item.entity';
import { FlashSaleEntity } from '../../domain/entities/flash-sale.entity';
import { FlashSaleStatus } from '../../domain/enums/flash-sale-status.enum';
import { toPublicFlashSaleResponse } from './flash-sale-response.mapper';

describe('toPublicFlashSaleResponse', () => {
  it('does not expose the configured quantity or inventory counts', () => {
    const response = toPublicFlashSaleResponse(
      new FlashSaleEntity({
        id: 1n,
        name: 'Weekend sale',
        startsAt: new Date('2026-09-25T10:00:00.000Z'),
        endsAt: new Date('2026-09-25T12:00:00.000Z'),
        status: FlashSaleStatus.Scheduled,
        items: [
          new FlashSaleItemEntity({
            id: 2n,
            flashSaleId: 1n,
            productSkuId: 101n,
            originalPrice: 100,
            salePrice: 75,
            quantity: 20,
          }),
        ],
        createdAt: new Date('2026-09-20T08:00:00.000Z'),
        updatedAt: new Date('2026-09-20T08:00:00.000Z'),
      }),
      { now: () => new Date('2026-09-25T11:00:00.000Z') },
    );

    expect(response.items[0]).toEqual({
      id: 2,
      productSkuId: 101,
      originalPrice: 100,
      salePrice: 75,
    });
    expect(response.items[0]).not.toHaveProperty('quantity');
    expect(response.items[0]).not.toHaveProperty('availableQuantity');
  });
});
