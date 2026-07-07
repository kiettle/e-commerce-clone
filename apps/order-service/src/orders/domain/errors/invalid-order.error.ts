import { OrderOperationError } from './order-operation.error';

export class InvalidOrderError extends OrderOperationError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOrderError';
  }
}
