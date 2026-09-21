import { FlashSalePriceChangedError } from '../errors/flash-sale-price-changed.error';
import { FlashSaleScheduleTimeError } from '../errors/flash-sale-schedule-time.error';

const MINIMUM_LEAD_TIME_MS = 5 * 60 * 1000;
const MAXIMUM_DURATION_MS = 24 * 60 * 60 * 1000;

export function validateFlashSaleScheduleTime(startsAt: Date, endsAt: Date, now: Date): void {
  if (![startsAt, endsAt, now].every((value) => Number.isFinite(value.getTime()))) {
    throw new FlashSaleScheduleTimeError('Scheduling time must be valid.');
  }

  const leadTime = startsAt.getTime() - now.getTime();
  const duration = endsAt.getTime() - startsAt.getTime();
  if (leadTime < MINIMUM_LEAD_TIME_MS) {
    throw new FlashSaleScheduleTimeError('Flash sale must start at least five minutes from now.');
  }
  if (duration <= 0) {
    throw new FlashSaleScheduleTimeError('Flash sale duration must be positive.');
  }
  if (duration > MAXIMUM_DURATION_MS) {
    throw new FlashSaleScheduleTimeError('Flash sale duration cannot exceed 24 hours.');
  }
}

export function assertFlashSalePriceUnchanged(
  productSkuId: bigint,
  currentPrice: number,
  originalPrice: number,
): void {
  if (currentPrice !== originalPrice) {
    throw new FlashSalePriceChangedError(productSkuId);
  }
}
