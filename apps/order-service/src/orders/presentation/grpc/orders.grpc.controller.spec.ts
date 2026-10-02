import { status as GrpcStatus } from '@grpc/grpc-js';
import { Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateOrderUseCase } from '../../application/use-cases/create-order.use-case';
import { GetOrderByCheckoutIdUseCase } from '../../application/use-cases/get-order-by-checkout-id.use-case';
import { OrderEntity } from '../../domain/entities/order.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { CheckoutIdConflictError } from '../../domain/errors/checkout-id-conflict.error';
import { InvalidOrderError } from '../../domain/errors/invalid-order.error';
import { InvalidOrderStateError } from '../../domain/errors/invalid-order-state.error';
import { OrderNotFoundError } from '../../domain/errors/order-not-found.error';
import { OrdersGrpcController } from './orders.grpc.controller';

describe('OrdersGrpcController', () => {
  const checkoutId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
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
  const createRequest = {
    user_id: '7',
    checkout_id: checkoutId,
    cart_id: '55',
    request_hash: 'a'.repeat(64),
    items: [
      {
        product_sku_id: '101',
        product_name: 'Keyboard',
        price: 19.99,
        quantity: 1,
        sku_code: 'KEYBOARD-BLACK',
        image_url: '',
      },
    ],
  };

  let createOrder: ReturnType<typeof vi.fn>;
  let getOrderByCheckoutId: ReturnType<typeof vi.fn>;
  let controller: OrdersGrpcController;

  beforeEach(() => {
    createOrder = vi.fn();
    getOrderByCheckoutId = vi.fn();
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    controller = new OrdersGrpcController(
      { execute: createOrder } as unknown as CreateOrderUseCase,
      { execute: getOrderByCheckoutId } as unknown as GetOrderByCheckoutIdUseCase,
    );
  });

  afterEach(() => {
    delete process.env.ORDER_DEMO_LOST_RESPONSE_AFTER;
    vi.restoreAllMocks();
  });

  it('returns a structured create-order result', async () => {
    createOrder.mockResolvedValue(order);

    await expect(controller.createOrder(createRequest)).resolves.toEqual({
      order_id: '12',
      status: OrderStatus.Created,
    });
  });

  it('maps version 2 sale snapshot fields into the create command', async () => {
    createOrder.mockResolvedValue(order);

    await controller.createOrder({
      ...createRequest,
      request_hash_version: 2,
      items: [
        {
          ...createRequest.items[0],
          regular_price: 39.99,
          price_source: 'FLASH_SALE',
          flash_sale_id: '10',
          flash_sale_item_id: '501',
          sale_ends_at: '2026-09-20T04:00:00.000Z',
        },
      ],
    });

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        requestHashVersion: 2,
        items: [
          expect.objectContaining({
            regularPrice: 39.99,
            priceSource: 'FLASH_SALE',
            flashSaleId: 10n,
            flashSaleItemId: 501n,
            saleEndsAt: '2026-09-20T04:00:00.000Z',
          }),
        ],
      }),
    );
  });

  it('can simulate a lost create response after persisting the order', async () => {
    process.env.ORDER_DEMO_LOST_RESPONSE_AFTER = '0';
    createOrder.mockResolvedValue(order);
    const faultController = new OrdersGrpcController(
      { execute: createOrder } as unknown as CreateOrderUseCase,
      { execute: getOrderByCheckoutId } as unknown as GetOrderByCheckoutIdUseCase,
    );

    await expectRpcCode(faultController.createOrder(createRequest), GrpcStatus.UNAVAILABLE);
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it('returns a structured lookup result', async () => {
    getOrderByCheckoutId.mockResolvedValue(order);

    await expect(controller.getOrderByCheckoutId({ checkout_id: checkoutId })).resolves.toEqual({
      order_id: '12',
      status: OrderStatus.Created,
    });
    expect(getOrderByCheckoutId).toHaveBeenCalledWith(checkoutId);
  });

  it('maps malformed checkout input to INVALID_ARGUMENT', async () => {
    createOrder.mockRejectedValue(new InvalidOrderError('Malformed hash.'));

    await expectRpcCode(controller.createOrder(createRequest), GrpcStatus.INVALID_ARGUMENT);
  });

  it('maps malformed numeric input to INVALID_ARGUMENT before the use case', async () => {
    await expectRpcCode(
      controller.createOrder({ ...createRequest, cart_id: 'not-an-integer' }),
      GrpcStatus.INVALID_ARGUMENT,
    );
    expect(createOrder).not.toHaveBeenCalled();
    expect(Logger.prototype.error).not.toHaveBeenCalled();
  });

  it('maps checkout ID reuse with another hash to ALREADY_EXISTS', async () => {
    createOrder.mockRejectedValue(new CheckoutIdConflictError(checkoutId));

    await expectRpcCode(controller.createOrder(createRequest), GrpcStatus.ALREADY_EXISTS);
  });

  it('maps a missing checkout order to NOT_FOUND', async () => {
    getOrderByCheckoutId.mockRejectedValue(new OrderNotFoundError(checkoutId));

    await expectRpcCode(
      controller.getOrderByCheckoutId({ checkout_id: checkoutId }),
      GrpcStatus.NOT_FOUND,
    );
  });

  it('maps an invalid order state to FAILED_PRECONDITION', async () => {
    createOrder.mockRejectedValue(new InvalidOrderStateError('Order state is invalid.'));

    await expectRpcCode(controller.createOrder(createRequest), GrpcStatus.FAILED_PRECONDITION);
  });

  it('maps an unexpected dependency failure to UNAVAILABLE', async () => {
    getOrderByCheckoutId.mockRejectedValue(new Error('Database unavailable.'));

    await expectRpcCode(
      controller.getOrderByCheckoutId({ checkout_id: checkoutId }),
      GrpcStatus.UNAVAILABLE,
    );
    expect(Logger.prototype.error).toHaveBeenCalled();
  });
});

async function expectRpcCode(operation: Promise<unknown>, expectedCode: GrpcStatus): Promise<void> {
  try {
    await operation;
    throw new Error('Expected the gRPC operation to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(RpcException);
    expect((error as RpcException).getError()).toEqual(
      expect.objectContaining({ code: expectedCode }),
    );
  }
}
