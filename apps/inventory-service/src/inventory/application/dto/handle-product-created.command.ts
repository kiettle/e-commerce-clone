import { ProductCreatedStockSku } from '../../domain/repositories/inventory.repository.port';

export interface HandleProductCreatedCommand {
  eventId: string;
  schemaVersion: number;
  productId: bigint;
  name: string;
  skus: ProductCreatedStockSku[];
}
