import { InvalidStockOperationError } from '../../domain/errors/invalid-stock-operation.error';
import { InventoryRepositoryPort } from '../../domain/repositories/inventory.repository.port';
import { HandleProductCreatedCommand } from '../dto/handle-product-created.command';

export class HandleProductCreatedUseCase {
  constructor(private readonly inventory: InventoryRepositoryPort) {}

  async execute(command: HandleProductCreatedCommand): Promise<void> {
    if (!command.eventId.trim()) {
      throw new InvalidStockOperationError('Product event id is required.');
    }

    if (command.skus.length === 0) {
      return;
    }

    for (const sku of command.skus) {
      if (sku.quantity < 0) {
        throw new InvalidStockOperationError('Initial quantity cannot be negative.');
      }
    }

    await this.inventory.initializeFromProductCreated(command);
  }
}
