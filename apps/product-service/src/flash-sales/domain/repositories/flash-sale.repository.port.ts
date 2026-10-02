import { FlashSaleEntity } from '../entities/flash-sale.entity';
import { FlashSaleStatus } from '../enums/flash-sale-status.enum';

export const FLASH_SALE_REPOSITORY = Symbol('FLASH_SALE_REPOSITORY');

export interface FlashSaleSkuReference {
  id: bigint;
  price: number;
  active: boolean;
}

export interface ScheduleFlashSaleRequest {
  flashSaleId: bigint;
  eventId: string;
  occurredAt: Date;
}

export interface FlashSaleRepositoryPort {
  findSkusByIds(productSkuIds: bigint[]): Promise<FlashSaleSkuReference[]>;
  create(flashSale: FlashSaleEntity): Promise<FlashSaleEntity>;
  findById(flashSaleId: bigint): Promise<FlashSaleEntity | null>;
  findByEffectiveStatus(
    status: FlashSaleStatus.Active | FlashSaleStatus.Upcoming,
    at: Date,
  ): Promise<FlashSaleEntity[]>;
  replaceDraft(flashSale: FlashSaleEntity): Promise<FlashSaleEntity>;
  cancelDraft(flashSaleId: bigint): Promise<FlashSaleEntity>;
  scheduleDraft(request: ScheduleFlashSaleRequest): Promise<FlashSaleEntity>;
}
