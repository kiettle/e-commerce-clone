import { OrderOperationError } from './order-operation.error';

export class InvalidOrderStateError extends OrderOperationError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOrderStateError';
  }
}
