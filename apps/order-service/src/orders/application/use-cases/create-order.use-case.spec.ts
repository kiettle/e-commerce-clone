import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { OrderEntity } from '../../domain/entities/order.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { CheckoutIdConflictError } from '../../domain/errors/checkout-id-conflict.error';
import { InvalidOrderError } from '../../domain/errors/invalid-order.error';
import { InvalidOrderStateError } from '../../domain/errors/invalid-order-state.error';
import { OrderRepositoryPort } from '../../domain/repositories/order.repository.port';
import { CreateOrderCommand, CreateOrderItemCommand } from '../dto/create-order.command';
import { CreateOrderUseCase } from './create-order.use-case';

describe('CreateOrderUseCase', () => {
  const checkoutIdentity = {
    checkoutId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    cartId: 55n,
    requestHash:
      '2a13c413324eeb88998d07a089827de9e41962dbd347308d8ed483adf33189c7',
  };
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
      findByCheckoutId: vi.fn(),
    };
    orders.findByCheckoutId.mockResolvedValue(null);
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

  it('persists a valid checkout identity after verifying its request hash', async () => {
    const persistedOrder = new OrderEntity({
      id: 9001n,
      userId: 7n,
      ...checkoutIdentity,
      totalAmount: 19.99,
      status: OrderStatus.Created,
      paymentStatus: PaymentStatus.Pending,
    });
    orders.create.mockResolvedValue(persistedOrder);

    await expect(
      useCase.execute({
        userId: 7n,
        ...checkoutIdentity,
        items: [validItem],
      }),
    ).resolves.toBe(persistedOrder);
    expect(orders.create).toHaveBeenCalledWith(
      expect.objectContaining(checkoutIdentity),
    );
  });

  it('returns the existing order when the checkout ID and hash match', async () => {
    const existingOrder = new OrderEntity({
      id: 9001n,
      userId: 7n,
      ...checkoutIdentity,
      totalAmount: 19.99,
      status: OrderStatus.Created,
      paymentStatus: PaymentStatus.Pending,
    });
    orders.findByCheckoutId.mockResolvedValue(existingOrder);

    await expect(
      useCase.execute({
        userId: 7n,
        ...checkoutIdentity,
        items: [],
      }),
    ).resolves.toBe(existingOrder);
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('rejects a checkout ID reused with a different request hash', async () => {
    orders.findByCheckoutId.mockResolvedValue(
      new OrderEntity({
        id: 9001n,
        userId: 7n,
        ...checkoutIdentity,
        requestHash: '0'.repeat(64),
        totalAmount: 19.99,
        status: OrderStatus.Created,
        paymentStatus: PaymentStatus.Pending,
      }),
    );

    await expect(
      useCase.execute({
        userId: 7n,
        ...checkoutIdentity,
        items: [validItem],
      }),
    ).rejects.toBeInstanceOf(CheckoutIdConflictError);
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('rejects an existing order with incomplete checkout identity', async () => {
    orders.findByCheckoutId.mockResolvedValue(
      new OrderEntity({
        id: 9001n,
        userId: 7n,
        checkoutId: checkoutIdentity.checkoutId,
        totalAmount: 19.99,
        status: OrderStatus.Created,
        paymentStatus: PaymentStatus.Pending,
      }),
    );

    await expect(
      useCase.execute({
        userId: 7n,
        ...checkoutIdentity,
        items: [validItem],
      }),
    ).rejects.toBeInstanceOf(InvalidOrderStateError);
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('rejects a partial checkout identity', async () => {
    await expect(
      useCase.execute({
        userId: 7n,
        checkoutId: checkoutIdentity.checkoutId,
        items: [validItem],
      }),
    ).rejects.toBeInstanceOf(InvalidOrderError);
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('rejects a checkout identity with a mismatched request hash', async () => {
    await expect(
      useCase.execute({
        userId: 7n,
        ...checkoutIdentity,
        requestHash: '0'.repeat(64),
        items: [validItem],
      }),
    ).rejects.toThrow(
      'Order request hash does not match its checkout snapshot.',
    );
    expect(orders.create).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an invalid checkout UUID',
      { ...checkoutIdentity, checkoutId: 'not-a-uuid' },
    ],
    ['a non-positive cart ID', { ...checkoutIdentity, cartId: 0n }],
    ['a request hash with the wrong length', { ...checkoutIdentity, requestHash: 'abc' }],
    [
      'a request hash containing uppercase hexadecimal',
      { ...checkoutIdentity, requestHash: 'A'.repeat(64) },
    ],
  ])('rejects checkout identity with %s', async (_description, identity) => {
    await expect(
      useCase.execute({ userId: 7n, ...identity, items: [validItem] }),
    ).rejects.toBeInstanceOf(InvalidOrderError);
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('requires an SKU code for an identified checkout order', async () => {
    await expect(
      useCase.execute({
        userId: 7n,
        ...checkoutIdentity,
        items: [{ ...validItem, skuCode: null }],
      }),
    ).rejects.toBeInstanceOf(InvalidOrderError);
    expect(orders.create).not.toHaveBeenCalled();
  });
});
