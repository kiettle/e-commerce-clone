import { OrderOperationError } from './order-operation.error';

export class CheckoutIdConflictError extends OrderOperationError {
  constructor(checkoutId: string) {
    super(`Checkout ${checkoutId} is already linked to another order request.`);
    this.name = 'CheckoutIdConflictError';
  }
}
