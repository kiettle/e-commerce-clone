import { describe, it, expect, vi } from 'vitest';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CartsGrpcController } from './carts.grpc.controller';
import { CartEntity } from '../../domain/entities/cart.entity';
import { CartStatus } from '../../domain/enums/cart-status.enum';
import { CheckoutNotFoundError } from '../../domain/errors/checkout-not-found.error';

function setup() {
  const cart = new CartEntity({ id: 20n, userId: 10n, status: CartStatus.Active, items: [] });
  const ports = Array.from({ length: 6 }, () => ({ execute: vi.fn().mockResolvedValue(cart) }));
  const controller = new CartsGrpcController(
    ...(ports as unknown as ConstructorParameters<typeof CartsGrpcController>),
  );
  return { controller, ports, cart };
}
async function grpcError(promise: Promise<unknown>) {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(RpcException);
  return (error as RpcException).getError();
}
describe('cart gRPC boundary', () => {
  it('passes the authenticated identity to the use case without losing precision', async () => {
    const { controller, ports } = setup();
    await controller.getActiveCart({ user_id: '9007199254740993' });
    expect(ports[0].execute).toHaveBeenCalledWith(9007199254740993n);
  });
  it('distinguishes a missing quantity from an explicit zero', async () => {
    const { controller, ports } = setup();
    expect(
      await grpcError(controller.updateCartItem({ user_id: '10', cart_item_id: '30' })),
    ).toMatchObject({ code: status.INVALID_ARGUMENT });
    expect(ports[2].execute).not.toHaveBeenCalled();
    await controller.updateCartItem({ user_id: '10', cart_item_id: '30', quantity: 0 });
    expect(ports[2].execute).toHaveBeenCalledWith({ userId: 10n, cartItemId: 30n, quantity: 0 });
  });
  it.each([-1, 2147483648, 1.5])('rejects invalid add quantity %i', async (quantity) => {
    const { controller, ports } = setup();
    expect(
      await grpcError(controller.addCartItem({ user_id: '10', product_sku_id: '100', quantity })),
    ).toMatchObject({ code: status.INVALID_ARGUMENT });
    expect(ports[1].execute).not.toHaveBeenCalled();
  });
  it('rejects missing user identity', async () => {
    const { controller } = setup();
    expect(await grpcError(controller.getActiveCart({ user_id: '' }))).toMatchObject({
      code: status.UNAUTHENTICATED,
    });
  });
  it('returns separate pending and completed outcomes using the same caller key', async () => {
    const { controller, ports, cart } = setup();
    const key = '550e8400-e29b-41d4-a716-446655440000';
    ports[4].execute.mockResolvedValueOnce({ outcome: 'PENDING', checkoutId: key });
    expect(
      await controller.checkoutCart({ user_id: '10', cart_id: '20', idempotency_key: key }),
    ).toEqual({ pending: { checkout_id: key } });
    ports[4].execute.mockResolvedValueOnce({
      outcome: 'COMPLETED',
      checkoutId: key,
      orderId: 50n,
      cart,
    });
    expect(
      await controller.checkoutCart({ user_id: '10', cart_id: '20', idempotency_key: key }),
    ).toMatchObject({ completed: { checkout_id: key, order_id: '50', cart: { id: '20' } } });
    expect(ports[4].execute).toHaveBeenLastCalledWith({
      userId: 10n,
      cartId: 20n,
      idempotencyKey: key,
    });
  });
  it('preserves owner-scoped not-found behavior', async () => {
    const { controller, ports } = setup();
    ports[5].execute.mockRejectedValue(new CheckoutNotFoundError('id'));
    expect(
      await grpcError(controller.getCheckoutStatus({ user_id: '10', checkout_id: 'id' })),
    ).toMatchObject({ code: status.NOT_FOUND });
  });
});

it('delegates valid item additions and deletions to the owning use cases', async () => {
  const { controller, ports } = setup();
  expect(
    await controller.addCartItem({ user_id: '10', product_sku_id: '100', quantity: 2 }),
  ).toMatchObject({ id: '20', user_id: '10', items: [] });
  expect(ports[1].execute).toHaveBeenCalledWith({ userId: 10n, productSkuId: 100n, quantity: 2 });
  expect(await controller.deleteCartItem({ user_id: '10', cart_item_id: '30' })).toMatchObject({
    id: '20',
  });
  expect(ports[3].execute).toHaveBeenCalledWith({ userId: 10n, cartItemId: 30n });
});
