import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  CreateFlashSaleRequestDto,
  UpdateFlashSaleRequestDto,
} from './flash-sale-request.dto';

describe('CreateFlashSaleRequestDto', () => {
  it('does not accept a client-supplied original price', async () => {
    const dto = plainToInstance(CreateFlashSaleRequestDto, {
      name: 'Weekend sale',
      startsAt: '2026-09-25T10:00:00.000Z',
      endsAt: '2026-09-25T12:00:00.000Z',
      items: [
        {
          productSkuId: 10,
          originalPrice: 0.01,
          salePrice: 80,
          quantity: 2,
        },
      ],
    });

    await expect(validate(dto, { whitelist: true })).resolves.toEqual([]);
    expect(dto.items[0]).not.toHaveProperty('originalPrice');
  });

  it('requires the description field for a full replacement and accepts null', async () => {
    const replacement = {
      name: 'Weekend sale',
      startsAt: '2026-09-25T10:00:00.000Z',
      endsAt: '2026-09-25T12:00:00.000Z',
      items: [],
    };

    const missing = plainToInstance(UpdateFlashSaleRequestDto, replacement);
    const missingErrors = await validate(missing);
    expect(missingErrors.some((error) => error.property === 'description')).toBe(true);

    const nullable = plainToInstance(UpdateFlashSaleRequestDto, {
      ...replacement,
      description: null,
    });
    await expect(validate(nullable)).resolves.toEqual([]);
  });
});
