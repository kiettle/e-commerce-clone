import { OrderOperationError } from './order-operation.error';

export class OrderNotFoundError extends OrderOperationError {
  constructor(checkoutId: string) {
    super(`Order for checkout ${checkoutId} was not found.`);
    this.name = 'OrderNotFoundError';
  }
}
