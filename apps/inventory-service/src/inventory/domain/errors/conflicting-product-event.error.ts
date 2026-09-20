import { InventoryOperationError } from './inventory-operation.error';

export class ConflictingProductEventError extends InventoryOperationError {
  constructor(eventId: string) {
    super(`Product event ${eventId} was already processed with different data.`);
    this.name = ConflictingProductEventError.name;
  }
}
