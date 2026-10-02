import { describe, expect, it } from 'vitest';
import { FlashSalePriceChangedError } from '../errors/flash-sale-price-changed.error';
import { FlashSaleScheduleTimeError } from '../errors/flash-sale-schedule-time.error';
import {
  assertFlashSalePriceUnchanged,
  validateFlashSaleScheduleTime,
} from './flash-sale-scheduling-policy';

describe('flash-sale scheduling policy', () => {
  const now = new Date('2026-09-21T08:00:00.000Z');

  it('accepts the minimum lead time and maximum duration boundaries', () => {
    const startsAt = new Date('2026-09-21T08:05:00.000Z');
    const endsAt = new Date('2026-09-22T08:05:00.000Z');

    expect(() => validateFlashSaleScheduleTime(startsAt, endsAt, now)).not.toThrow();
  });

  it.each([
    {
      name: 'less than five minutes of lead time',
      startsAt: new Date('2026-09-21T08:04:59.999Z'),
      endsAt: new Date('2026-09-21T09:00:00.000Z'),
    },
    {
      name: 'a non-positive duration',
      startsAt: new Date('2026-09-21T09:00:00.000Z'),
      endsAt: new Date('2026-09-21T09:00:00.000Z'),
    },
    {
      name: 'a duration above 24 hours',
      startsAt: new Date('2026-09-21T09:00:00.000Z'),
      endsAt: new Date('2026-09-22T09:00:00.001Z'),
    },
    {
      name: 'an invalid date',
      startsAt: new Date(Number.NaN),
      endsAt: new Date('2026-09-21T09:00:00.000Z'),
    },
  ])('rejects $name', ({ startsAt, endsAt }) => {
    expect(() => validateFlashSaleScheduleTime(startsAt, endsAt, now)).toThrow(
      FlashSaleScheduleTimeError,
    );
  });

  it('detects a regular-price change made after draft creation', () => {
    expect(() => assertFlashSalePriceUnchanged(101n, 120, 100)).toThrow(FlashSalePriceChangedError);
  });

  it('accepts an unchanged regular price', () => {
    expect(() => assertFlashSalePriceUnchanged(101n, 100, 100)).not.toThrow();
  });
});
