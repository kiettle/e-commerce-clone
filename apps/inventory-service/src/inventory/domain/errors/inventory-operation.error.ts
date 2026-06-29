export class InventoryOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InventoryOperationError';
  }
}
