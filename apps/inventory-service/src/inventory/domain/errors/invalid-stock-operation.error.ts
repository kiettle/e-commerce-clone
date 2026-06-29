import { InventoryOperationError } from './inventory-operation.error';

export class InvalidStockOperationError extends InventoryOperationError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStockOperationError';
  }
}
