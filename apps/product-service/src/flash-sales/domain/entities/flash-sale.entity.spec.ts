import { describe, expect, it } from 'vitest';
import { FlashSaleStatus } from '../enums/flash-sale-status.enum';
import { FlashSaleNotDraftError } from '../errors/flash-sale-not-draft.error';
import { InvalidFlashSaleError } from '../errors/invalid-flash-sale.error';
import { Clock } from '../services/clock';
import { FlashSaleItemEntity } from './flash-sale-item.entity';
import { FlashSaleEntity } from './flash-sale.entity';

const startsAt = new Date('2026-09-20T10:00:00.000Z');
const endsAt = new Date('2026-09-20T12:00:00.000Z');

describe('FlashSaleEntity', () => {
  it('reports a draft as DRAFT', () => {
    const flashSale = createFlashSale();

    expect(flashSale.getEffectiveStatus(clockAt('2026-09-20T11:00:00.000Z'))).toBe(
      FlashSaleStatus.Draft,
    );
  });

  it('reports a future scheduled sale as UPCOMING', () => {
    const flashSale = createScheduledSale();

    expect(flashSale.getEffectiveStatus(clockAt('2026-09-20T09:59:59.999Z'))).toBe(
      FlashSaleStatus.Upcoming,
    );
  });

  it('reports a current scheduled sale as ACTIVE', () => {
    const flashSale = createScheduledSale();

    expect(flashSale.getEffectiveStatus(clockAt('2026-09-20T11:00:00.000Z'))).toBe(
      FlashSaleStatus.Active,
    );
  });

  it('reports an expired scheduled sale as ENDED', () => {
    const flashSale = createScheduledSale();

    expect(flashSale.getEffectiveStatus(clockAt('2026-09-20T12:00:00.000Z'))).toBe(
      FlashSaleStatus.Ended,
    );
  });

  it('rejects an invalid time window', () => {
    expect(() =>
      createFlashSale({
        startsAt: new Date('2026-09-20T12:00:00.000Z'),
        endsAt: new Date('2026-09-20T12:00:00.000Z'),
      }),
    ).toThrow(InvalidFlashSaleError);
  });

  it('rejects duplicate SKU IDs', () => {
    expect(() => createFlashSale({ items: [createItem(1n), createItem(1n)] })).toThrow(
      'A product SKU can appear only once in a flash sale.',
    );
  });

  it('rejects a sale price equal to the regular price', () => {
    expect(() => createItem(1n, { salePrice: 100 })).toThrow(InvalidFlashSaleError);
  });

  it('rejects a sale price above the regular price', () => {
    expect(() => createItem(1n, { salePrice: 101 })).toThrow(InvalidFlashSaleError);
  });

  it('rejects a non-positive quantity', () => {
    expect(() => createItem(1n, { quantity: 0 })).toThrow(InvalidFlashSaleError);
  });

  it('rejects scheduling an empty sale', () => {
    const flashSale = createFlashSale({ items: [] });

    expect(() => flashSale.schedule()).toThrow(InvalidFlashSaleError);
  });

  it('does not allow a scheduled sale to change', () => {
    const flashSale = createScheduledSale();

    expect(() => flashSale.update({ name: 'Changed sale' })).toThrow(FlashSaleNotDraftError);
  });

  it('does not allow a cancelled sale to change', () => {
    const flashSale = createFlashSale();
    flashSale.cancel();

    expect(() => flashSale.update({ name: 'Changed sale' })).toThrow(FlashSaleNotDraftError);
  });
});

function createScheduledSale(): FlashSaleEntity {
  const flashSale = createFlashSale();
  flashSale.schedule();
  return flashSale;
}

function createFlashSale(
  overrides: Partial<ConstructorParameters<typeof FlashSaleEntity>[0]> = {},
): FlashSaleEntity {
  return new FlashSaleEntity({
    name: 'Weekend sale',
    startsAt,
    endsAt,
    items: [createItem(1n)],
    ...overrides,
  });
}

function createItem(
  productSkuId: bigint,
  overrides: Partial<ConstructorParameters<typeof FlashSaleItemEntity>[0]> = {},
): FlashSaleItemEntity {
  return new FlashSaleItemEntity({
    productSkuId,
    originalPrice: 100,
    salePrice: 80,
    quantity: 10,
    ...overrides,
  });
}

function clockAt(isoDate: string): Clock {
  return { now: () => new Date(isoDate) };
}
