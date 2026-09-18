import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { OrderEntity } from '../../domain/entities/order.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { InvalidOrderError } from '../../domain/errors/invalid-order.error';
import { OrderNotFoundError } from '../../domain/errors/order-not-found.error';
import { OrderRepositoryPort } from '../../domain/repositories/order.repository.port';
import { GetOrderByCheckoutIdUseCase } from './get-order-by-checkout-id.use-case';

describe('GetOrderByCheckoutIdUseCase', () => {
  const checkoutId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let orders: Mocked<OrderRepositoryPort>;
  let useCase: GetOrderByCheckoutIdUseCase;

  beforeEach(() => {
    orders = {
      create: vi.fn(),
      findByCheckoutId: vi.fn(),
    };
    useCase = new GetOrderByCheckoutIdUseCase(orders);
  });

  it('returns the order for a checkout ID', async () => {
    const order = new OrderEntity({
      id: 12n,
      userId: 7n,
      checkoutId,
      cartId: 55n,
      requestHash: 'a'.repeat(64),
      totalAmount: 19.99,
      status: OrderStatus.Created,
      paymentStatus: PaymentStatus.Pending,
    });
    orders.findByCheckoutId.mockResolvedValue(order);

    await expect(useCase.execute(checkoutId)).resolves.toBe(order);
    expect(orders.findByCheckoutId).toHaveBeenCalledWith(checkoutId);
  });

  it('rejects a malformed checkout ID before querying the repository', async () => {
    await expect(useCase.execute('not-a-uuid')).rejects.toBeInstanceOf(
      InvalidOrderError,
    );
    expect(orders.findByCheckoutId).not.toHaveBeenCalled();
  });

  it('rejects a checkout ID that has no order', async () => {
    orders.findByCheckoutId.mockResolvedValue(null);

    await expect(useCase.execute(checkoutId)).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });
});
