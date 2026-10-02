import { OrderEntity } from '../../domain/entities/order.entity';
import { OrderNotFoundError } from '../../domain/errors/order-not-found.error';
import { OrderRepositoryPort } from '../../domain/repositories/order.repository.port';
import { assertValidCheckoutId } from '../services/checkout-identity.validation';

export class GetOrderByCheckoutIdUseCase {
  constructor(private readonly orders: OrderRepositoryPort) {}

  async execute(checkoutId: string): Promise<OrderEntity> {
    assertValidCheckoutId(checkoutId);

    const order = await this.orders.findByCheckoutId(checkoutId);

    if (!order) {
      throw new OrderNotFoundError(checkoutId);
    }

    return order;
  }
}
