import { InvalidStockOperationError } from '../../domain/errors/invalid-stock-operation.error';
import {
  InventoryRepositoryPort,
  StockOperationItem,
} from '../../domain/repositories/inventory.repository.port';
import { StockOperationCommand } from '../dto/stock-operation.command';

export class ReserveStockUseCase {
  constructor(private readonly inventory: InventoryRepositoryPort) {}

  async execute(command: StockOperationCommand): Promise<void> {
    const items = normalizeStockItems(command.items);

    if (items.length === 0) {
      throw new InvalidStockOperationError('Stock operation items are required.');
    }

    await this.inventory.reserveStock(command.cartId, items);
  }
}

export function normalizeStockItems(
  items: StockOperationItem[],
): StockOperationItem[] {
  const quantityBySku = new Map<bigint, number>();

  for (const item of items) {
    if (item.quantity <= 0) {
      throw new InvalidStockOperationError('Stock quantity must be greater than zero.');
    }

    quantityBySku.set(
      item.productSkuId,
      (quantityBySku.get(item.productSkuId) ?? 0) + item.quantity,
    );
  }

  return Array.from(quantityBySku, ([productSkuId, quantity]) => ({
    productSkuId,
    quantity,
  }));
}
