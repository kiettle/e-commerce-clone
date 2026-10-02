import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidStockOperationError } from '../../domain/errors/invalid-stock-operation.error';
import { FlashSaleStockRepositoryPort } from '../../domain/repositories/flash-sale-stock.repository.port';
import { HandleFlashSaleScheduledCommand } from '../dto/handle-flash-sale-scheduled.command';
import { HandleFlashSaleScheduledUseCase } from './handle-flash-sale-scheduled.use-case';

describe('HandleFlashSaleScheduledUseCase', () => {
  let repository: FlashSaleStockRepositoryPort;
  let useCase: HandleFlashSaleScheduledUseCase;

  beforeEach(() => {
    repository = { initializeFromFlashSaleScheduled: vi.fn() };
    useCase = new HandleFlashSaleScheduledUseCase(repository);
  });

  it('validates and initializes every sale item', async () => {
    await useCase.execute(command());

    expect(repository.initializeFromFlashSaleScheduled).toHaveBeenCalledWith({
      ...command(),
      payloadHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it.each([
    ['event id', { eventId: '' }],
    ['schema version', { schemaVersion: 2 }],
    ['sale ID', { flashSaleId: 0n }],
    ['invalid start date', { startsAt: new Date(Number.NaN) }],
    ['time window', { endsAt: new Date('2026-10-01T07:00:00.000Z') }],
    ['empty item list', { items: [] }],
    ['non-positive item ID', { items: [{ ...command().items[0], flashSaleItemId: 0n }] }],
    ['positive limit', { items: [{ ...command().items[0], stockLimit: 0 }] }],
    ['integer limit', { items: [{ ...command().items[0], stockLimit: 1.5 }] }],
    ['one-unit per-user limit', { items: [{ ...command().items[0], maxQuantityPerUser: 2 }] }],
    [
      'duplicate sale-item IDs',
      { items: [command().items[0], { ...command().items[0], productSkuId: 1002n }] },
    ],
    [
      'duplicate SKU IDs',
      { items: [command().items[0], { ...command().items[0], flashSaleItemId: 502n }] },
    ],
  ])('rejects an invalid %s', async (_case, overrides) => {
    await expect(useCase.execute(command(overrides))).rejects.toBeInstanceOf(
      InvalidStockOperationError,
    );
    expect(repository.initializeFromFlashSaleScheduled).not.toHaveBeenCalled();
  });
});

function command(
  overrides: Partial<HandleFlashSaleScheduledCommand> = {},
): HandleFlashSaleScheduledCommand {
  return {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    schemaVersion: 1,
    flashSaleId: 50n,
    startsAt: new Date('2026-10-01T08:00:00.000Z'),
    endsAt: new Date('2026-10-01T10:00:00.000Z'),
    items: [
      {
        flashSaleItemId: 501n,
        productSkuId: 1001n,
        stockLimit: 25,
        maxQuantityPerUser: 1,
      },
    ],
    ...overrides,
  };
}
