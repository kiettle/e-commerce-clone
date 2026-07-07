import { OrderEntity } from '../../domain/entities/order.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { InvalidOrderError } from '../../domain/errors/invalid-order.error';
import { OrdersGrpcController } from './orders.grpc.controller';

describe('OrdersGrpcController', () => {
  it('maps create order request to use case command', async () => {
    const createOrderUseCase = {
      execute: jest.fn(async () =>
        new OrderEntity({
          id: 55n,
          userId: 7n,
          totalAmount: 25,
          status: OrderStatus.Created,
          paymentStatus: PaymentStatus.Pending,
        }),
      ),
    };
    const controller = new OrdersGrpcController(createOrderUseCase as any);

    const response = await controller.createOrder({
      user_id: '7',
      items: [
        {
          product_sku_id: '10',
          product_name: 'Orange Shirt',
          price: 12.5,
          quantity: 2,
        },
      ],
    });

    expect(response).toEqual({
      order_id: '55',
      status: OrderStatus.Created,
    });
    expect(createOrderUseCase.execute).toHaveBeenCalledWith({
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
  });

  it('returns failed status for order operation errors', async () => {
    const createOrderUseCase = {
      execute: jest.fn(async () => {
        throw new InvalidOrderError('Order items are required.');
      }),
    };
    const controller = new OrdersGrpcController(createOrderUseCase as any);

    await expect(
      controller.createOrder({
        user_id: '7',
        items: [],
      }),
    ).resolves.toEqual({
      order_id: '0',
      status: 'FAILED: Order items are required.',
    });
  });
});
