import { FlashSaleStockItem } from '../../domain/repositories/flash-sale-stock.repository.port';

export interface HandleFlashSaleScheduledCommand {
  eventId: string;
  schemaVersion: number;
  flashSaleId: bigint;
  startsAt: Date;
  endsAt: Date;
  items: FlashSaleStockItem[];
}
