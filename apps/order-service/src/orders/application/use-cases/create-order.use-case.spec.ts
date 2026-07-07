import { OrderEntity } from '../../domain/entities/order.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { InvalidOrderError } from '../../domain/errors/invalid-order.error';
import { OrderRepositoryPort } from '../../domain/repositories/order.repository.port';
import {
  calculateTotalAmount,
  CreateOrderUseCase,
} from './create-order.use-case';

describe('CreateOrderUseCase', () => {
  let orders: jest.Mocked<OrderRepositoryPort>;
  let useCase: CreateOrderUseCase;

  beforeEach(() => {
    orders = {
      create: jest.fn(
        async (data) =>
          new OrderEntity({
            id: 99n,
            userId: data.userId,
            totalAmount: data.totalAmount,
            status: data.status,
            paymentStatus: data.paymentStatus,
            shippingAddress: data.shippingAddress,
          }),
      ),
    };
    useCase = new CreateOrderUseCase(orders);
  });

  it('creates order with calculated total and default statuses', async () => {
    const order = await useCase.execute({
      userId: 7n,
      items: [
        {
          productSkuId: 10n,
          productName: 'Orange Shirt',
          skuCode: 'SHIRT-ORANGE-M',
          price: 12.5,
          quantity: 2,
        },
        {
          productSkuId: 11n,
          productName: 'Blue Shirt',
          skuCode: 'SHIRT-BLUE-M',
          price: 7,
          quantity: 3,
        },
      ],
    });

    expect(order.id).toBe(99n);
    expect(orders.create).toHaveBeenCalledWith({
      userId: 7n,
      totalAmount: 46,
      status: OrderStatus.Created,
      paymentStatus: PaymentStatus.Pending,
      shippingAddress: undefined,
      items: [
        {
          productSkuId: 10n,
          productName: 'Orange Shirt',
          skuCode: 'SHIRT-ORANGE-M',
          imageUrl: undefined,
          price: 12.5,
          quantity: 2,
        },
        {
          productSkuId: 11n,
          productName: 'Blue Shirt',
          skuCode: 'SHIRT-BLUE-M',
          imageUrl: undefined,
          price: 7,
          quantity: 3,
        },
      ],
    });
  });

  it('uses product SKU ID as skuCode when caller has no SKU snapshot', async () => {
    await useCase.execute({
      userId: 7n,
      items: [
        {
          productSkuId: 10n,
          productName: 'Orange Shirt',
          price: 12.5,
          quantity: 2,
        },
      ],
    });

    expect(orders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            productSkuId: 10n,
            skuCode: '10',
          }),
        ],
      }),
    );
  });

  it('rounds total amount to two decimal places', () => {
    expect(
      calculateTotalAmount([
        { price: 0.1, quantity: 1 },
        { price: 0.2, quantity: 1 },
      ]),
    ).toBe(0.3);
  });

  it('rejects empty items', async () => {
    await expect(
      useCase.execute({
        userId: 7n,
        items: [],
      }),
    ).rejects.toBeInstanceOf(InvalidOrderError);
  });

  it('rejects non-positive user ID', async () => {
    await expect(
      useCase.execute({
        userId: 0n,
        items: [
          {
            productSkuId: 10n,
            productName: 'Orange Shirt',
            price: 12.5,
            quantity: 2,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(InvalidOrderError);
  });

  it('rejects invalid item values', async () => {
    await expect(
      useCase.execute({
        userId: 7n,
        items: [
          {
            productSkuId: 10n,
            productName: '',
            price: 12.5,
            quantity: 2,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(InvalidOrderError);
  });
});
