export class OrderOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderOperationError';
  }
}
