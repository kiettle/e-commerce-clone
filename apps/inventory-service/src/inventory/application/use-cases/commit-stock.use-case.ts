import { InvalidStockOperationError } from '../../domain/errors/invalid-stock-operation.error';
import { InventoryRepositoryPort } from '../../domain/repositories/inventory.repository.port';
import { StockOperationCommand } from '../dto/stock-operation.command';
import { normalizeStockItems, validateStockOperation } from './reserve-stock.use-case';

export class CommitStockUseCase {
  constructor(private readonly inventory: InventoryRepositoryPort) {}

  async execute(command: StockOperationCommand): Promise<void> {
    validateStockOperation(command, false);
    const items = normalizeStockItems(command.items);

    if (items.length === 0) {
      throw new InvalidStockOperationError('Stock operation items are required.');
    }

    await this.inventory.commitStock({ ...command, items });
  }
}
