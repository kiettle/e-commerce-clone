export class CartOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CartOperationError';
  }
}
