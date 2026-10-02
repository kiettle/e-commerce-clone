export class InventoryOperationError extends Error {
  constructor(
    message: string,
    readonly code = 'INVENTORY_OPERATION_REJECTED',
  ) {
    super(message);
    this.name = 'InventoryOperationError';
  }
}
