import { FlashSaleEntity } from '../../domain/entities/flash-sale.entity';
import { FlashSaleStatus } from '../../domain/enums/flash-sale-status.enum';
import { FlashSaleRepositoryPort } from '../../domain/repositories/flash-sale.repository.port';
import { Clock } from '../../domain/services/clock';

const systemClock: Clock = { now: () => new Date() };

export interface FlashSaleListResult {
  flashSales: FlashSaleEntity[];
  evaluatedAt: Date;
}

export class ListFlashSalesUseCase {
  constructor(
    private readonly flashSales: FlashSaleRepositoryPort,
    private readonly clock: Clock = systemClock,
  ) {}

  async execute(
    status: FlashSaleStatus.Active | FlashSaleStatus.Upcoming,
  ): Promise<FlashSaleListResult> {
    const evaluatedAt = this.clock.now();
    return {
      flashSales: await this.flashSales.findByEffectiveStatus(status, evaluatedAt),
      evaluatedAt,
    };
  }
}
