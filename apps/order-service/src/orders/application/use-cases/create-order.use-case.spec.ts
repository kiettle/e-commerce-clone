import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { OrderEntity } from '../../domain/entities/order.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { InvalidOrderError } from '../../domain/errors/invalid-order.error';
import { OrderRepositoryPort } from '../../domain/repositories/order.repository.port';
import { CreateOrderCommand, CreateOrderItemCommand } from '../dto/create-order.command';
import { CreateOrderUseCase } from './create-order.use-case';

describe('CreateOrderUseCase', () => {
  const validItem: CreateOrderItemCommand = {
    productName: 'Keyboard',
    productSkuId: 101n,
    skuCode: 'KEYBOARD-BLACK',
    imageUrl: null,
    price: 19.99,
    quantity: 1,
  };

  let orders: Mocked<OrderRepositoryPort>;
  let useCase: CreateOrderUseCase;

  beforeEach(() => {
    orders = {
      create: vi.fn(),
    };
    useCase = new CreateOrderUseCase(orders);
  });

  it('rejects an empty order without calling the repository', async () => {
    await expect(useCase.execute({ userId: 7n, items: [] })).rejects.toBeInstanceOf(
      InvalidOrderError,
    );
    expect(orders.create).not.toHaveBeenCalled();
  });

  const invalidCommands: Array<[string, CreateOrderCommand]> = [
    ['a non-positive user ID', { userId: 0n, items: [validItem] }],
    [
      'a non-positive SKU ID',
      {
        userId: 7n,
        items: [{ ...validItem, productSkuId: 0n }],
      },
    ],
    [
      'a negative price',
      {
        userId: 7n,
        items: [{ ...validItem, price: -1 }],
      },
    ],
    [
      'a non-finite price',
      {
        userId: 7n,
        items: [{ ...validItem, price: Number.NaN }],
      },
    ],
    [
      'a non-positive quantity',
      {
        userId: 7n,
        items: [{ ...validItem, quantity: 0 }],
      },
    ],
    [
      'a non-integer quantity',
      {
        userId: 7n,
        items: [{ ...validItem, quantity: 1.5 }],
      },
    ],
  ];

  it.each(invalidCommands)(
    'rejects an order with %s without calling the repository',
    async (_description, command) => {
      await expect(useCase.execute(command)).rejects.toBeInstanceOf(InvalidOrderError);
      expect(orders.create).not.toHaveBeenCalled();
    },
  );

  it('normalizes prices and calculates the total server-side', async () => {
    const command: CreateOrderCommand = {
      userId: 7n,
      shippingAddress: '123 Example Street',
      items: [
        {
          productName: ' Keyboard ',
          productSkuId: 101n,
          skuCode: ' KEYBOARD-BLACK ',
          imageUrl: null,
          price: 10.129,
          quantity: 2,
        },
        {
          productName: 'Mouse',
          productSkuId: 102n,
          skuCode: null,
          imageUrl: null,
          price: 2.345,
          quantity: 3,
        },
      ],
    };
    const persistedOrder = new OrderEntity({
      id: 9001n,
      userId: 7n,
      totalAmount: 27.31,
      status: OrderStatus.Created,
      paymentStatus: PaymentStatus.Pending,
      shippingAddress: '123 Example Street',
    });
    orders.create.mockResolvedValue(persistedOrder);

    const result = await useCase.execute(command);

    expect(orders.create).toHaveBeenCalledTimes(1);
    expect(orders.create).toHaveBeenCalledWith({
      userId: 7n,
      totalAmount: 27.31,
      status: OrderStatus.Created,
      paymentStatus: PaymentStatus.Pending,
      shippingAddress: '123 Example Street',
      items: [
        {
          productName: 'Keyboard',
          productSkuId: 101n,
          skuCode: 'KEYBOARD-BLACK',
          imageUrl: null,
          price: 10.13,
          quantity: 2,
        },
        {
          productName: 'Mouse',
          productSkuId: 102n,
          skuCode: '102',
          imageUrl: null,
          price: 2.35,
          quantity: 3,
        },
      ],
    });
    expect(result).toBe(persistedOrder);
  });
});
