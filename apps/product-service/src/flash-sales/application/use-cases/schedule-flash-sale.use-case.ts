import { randomUUID } from 'node:crypto';
import { FlashSaleEntity } from '../../domain/entities/flash-sale.entity';
import { FlashSaleRepositoryPort } from '../../domain/repositories/flash-sale.repository.port';
import { Clock } from '../../domain/services/clock';

const systemClock: Clock = { now: () => new Date() };

export class ScheduleFlashSaleUseCase {
  constructor(
    private readonly flashSales: FlashSaleRepositoryPort,
    private readonly clock: Clock = systemClock,
    private readonly createEventId: () => string = randomUUID,
  ) {}

  execute(flashSaleId: bigint): Promise<FlashSaleEntity> {
    return this.flashSales.scheduleDraft({
      flashSaleId,
      eventId: this.createEventId(),
      occurredAt: this.clock.now(),
    });
  }
}
