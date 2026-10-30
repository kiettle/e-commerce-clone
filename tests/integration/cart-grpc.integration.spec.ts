import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import {
  ClientProxyFactory,
  Transport,
  type ClientGrpc,
  type MicroserviceOptions,
} from '@nestjs/microservices';
import { createServer } from 'node:net';
import { firstValueFrom } from 'rxjs';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { CartsGrpcController } from '../../apps/cart-service/src/carts/presentation/grpc/carts.grpc.controller';
import { CartGatewayClient } from '../../apps/gateway/src/cart/infrastructure/grpc/cart-gateway.client';
import { GetActiveCartUseCase } from '../../apps/cart-service/src/carts/application/use-cases/get-active-cart.use-case';
import { AddCartItemUseCase } from '../../apps/cart-service/src/carts/application/use-cases/add-cart-item.use-case';
import { UpdateCartItemUseCase } from '../../apps/cart-service/src/carts/application/use-cases/update-cart-item.use-case';
import { DeleteCartItemUseCase } from '../../apps/cart-service/src/carts/application/use-cases/delete-cart-item.use-case';
import { CheckoutCartUseCase } from '../../apps/cart-service/src/carts/application/use-cases/checkout-cart.use-case';
import { GetCheckoutStatusUseCase } from '../../apps/cart-service/src/carts/application/use-cases/get-checkout-status.use-case';
import { CartEntity } from '../../apps/cart-service/src/carts/domain/entities/cart.entity';
import { CartStatus } from '../../apps/cart-service/src/carts/domain/enums/cart-status.enum';
import { CheckoutAttemptEntity } from '../../apps/cart-service/src/carts/domain/entities/checkout-attempt.entity';
import { CheckoutStatus } from '../../apps/cart-service/src/carts/domain/enums/checkout-status.enum';
import { CheckoutTerminalError } from '../../apps/cart-service/src/carts/domain/errors/checkout-terminal.error';
import { CheckoutNotFoundError } from '../../apps/cart-service/src/carts/domain/errors/checkout-not-found.error';
import type { CartGrpcService } from '../../libs/proto/cart.types';
import { join } from 'node:path';

const key = '550e8400-e29b-41d4-a716-446655440000';
const cart = new CartEntity({ id: 20n, userId: 10n, status: CartStatus.Active, items: [] });
const tokens = [
  GetActiveCartUseCase,
  AddCartItemUseCase,
  UpdateCartItemUseCase,
  DeleteCartItemUseCase,
  CheckoutCartUseCase,
  GetCheckoutStatusUseCase,
];
const ports = tokens.map(() => ({ execute: vi.fn() }));
@Module({
  controllers: [CartsGrpcController],
  providers: tokens.map((provide, i) => ({ provide, useValue: ports[i] })),
})
class CartTestModule {}
async function freeAddress() {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const address = `127.0.0.1:${(socket.address() as { port: number }).port}`;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return address;
}
describe('cart native gRPC transport', () => {
  let server: Awaited<ReturnType<typeof NestFactory.createMicroservice>>;
  let client: CartGatewayClient;
  let raw: ClientGrpc & { close(): void };
  let service: CartGrpcService;
  let address: string;
  beforeAll(async () => {
    address = await freeAddress();
    server = await NestFactory.createMicroservice<MicroserviceOptions>(CartTestModule, {
      logger: false,
      transport: Transport.GRPC,
      options: {
        package: 'cart',
        protoPath: join(process.cwd(), 'libs/proto/cart.proto'),
        url: address,
        loader: { keepCase: true, longs: String, defaults: true, oneofs: true },
      },
    });
    await server.listen();
    client = new CartGatewayClient(new ConfigService({ CART_GRPC_URL: address }));
    client.onModuleInit();
    raw = ClientProxyFactory.create({
      transport: Transport.GRPC,
      options: {
        package: 'cart',
        protoPath: join(process.cwd(), 'libs/proto/cart.proto'),
        url: address,
        loader: { keepCase: true, longs: String, defaults: true, oneofs: true },
      },
    }) as typeof raw;
    service = raw.getService<CartGrpcService>('CartService');
  });
  beforeEach(() => {
    ports.forEach((port) => port.execute.mockReset().mockResolvedValue(cart));
    ports[4].execute.mockResolvedValue({
      outcome: 'COMPLETED',
      checkoutId: key,
      orderId: 50n,
      cart,
    });
    ports[5].execute.mockResolvedValue(
      new CheckoutAttemptEntity({
        id: key,
        userId: 10n,
        cartId: 20n,
        idempotencyKey: key,
        requestHash: 'a'.repeat(64),
        itemsSnapshot: [],
        status: CheckoutStatus.Completed,
        orderId: 50n,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
  });
  afterAll(async () => {
    client?.onApplicationShutdown();
    raw?.close();
    await server?.close();
  });
  it('round-trips every cart operation through the server and gateway adapter', async () => {
    expect(await client.getActiveCart(10)).toMatchObject({ id: 20, totalAmount: 0, items: [] });
    await client.addCartItem(10, { productSkuId: 100, quantity: 2 });
    expect(ports[1].execute).toHaveBeenCalledWith({ userId: 10n, productSkuId: 100n, quantity: 2 });
    await client.updateCartItem(10, 30, { quantity: 0 });
    expect(ports[2].execute).toHaveBeenCalledWith({ userId: 10n, cartItemId: 30n, quantity: 0 });
    await client.deleteCartItem(10, 30);
    expect(ports[3].execute).toHaveBeenCalledWith({ userId: 10n, cartItemId: 30n });
    expect(await client.checkoutCart(10, 20, key)).toMatchObject({
      checkoutId: key,
      status: 'COMPLETED',
      orderId: 50,
    });
    expect(await client.getCheckoutStatus(10, key)).toMatchObject({
      checkoutId: key,
      cartId: 20,
      status: 'COMPLETED',
      orderId: 50,
      lastError: null,
    });
  });
  it('preserves int64 IDs internally and rejects missing update quantity', async () => {
    await firstValueFrom(service.getActiveCart({ user_id: '9223372036854775807' }));
    expect(ports[0].execute).toHaveBeenCalledWith(9223372036854775807n);
    await expect(
      firstValueFrom(service.updateCartItem({ user_id: '10', cart_item_id: '30' })),
    ).rejects.toMatchObject({ code: 3 });
    expect(ports[2].execute).not.toHaveBeenCalled();
  });
  it('round-trips pending outcomes and structured business errors', async () => {
    ports[4].execute.mockResolvedValueOnce({ outcome: 'PENDING', checkoutId: key });
    expect(await client.checkoutCart(10, 20, key)).toEqual({
      checkoutId: key,
      status: 'RECONCILIATION_REQUIRED',
    });
    ports[4].execute.mockRejectedValueOnce(
      new CheckoutTerminalError('Sold out.', 'FLASH_SALE_SOLD_OUT'),
    );
    await expect(client.checkoutCart(10, 20, key)).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'FLASH_SALE_SOLD_OUT' }),
    });
    ports[5].execute.mockRejectedValueOnce(new CheckoutNotFoundError(key));
    await expect(client.getCheckoutStatus(11, key)).rejects.toMatchObject({ status: 404 });
  });
  it('bounds a stalled read using a real gRPC deadline', async () => {
    const bounded = new CartGatewayClient(
      new ConfigService({
        CART_GRPC_URL: address,
        GRPC_REQUEST_TIMEOUT_MS: 40,
        GATEWAY_CHECKOUT_TIMEOUT_MS: 150,
      }),
    );
    bounded.onModuleInit();
    ports[0].execute.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(cart), 150)),
    );
    try {
      await expect(bounded.getActiveCart(10)).rejects.toMatchObject({ status: 504 });
    } finally {
      bounded.onApplicationShutdown();
    }
    await new Promise((resolve) => setTimeout(resolve, 170));
  });
  it('does not retry a checkout when its response is lost to a deadline', async () => {
    const bounded = new CartGatewayClient(
      new ConfigService({
        CART_GRPC_URL: address,
        GRPC_REQUEST_TIMEOUT_MS: 30,
        GATEWAY_CHECKOUT_TIMEOUT_MS: 80,
      }),
    );
    bounded.onModuleInit();
    let committed = false;
    ports[4].execute.mockImplementation(async () => {
      if (!committed) await new Promise((resolve) => setTimeout(resolve, 160));
      committed = true;
      return { outcome: 'COMPLETED', checkoutId: key, orderId: 50n, cart };
    });
    try {
      await expect(bounded.checkoutCart(10, 20, key)).rejects.toMatchObject({ status: 504 });
      expect(ports[4].execute).toHaveBeenCalledTimes(1);
      await new Promise((resolve) => setTimeout(resolve, 180));
      expect(committed).toBe(true);
      expect(await bounded.checkoutCart(10, 20, key)).toMatchObject({
        checkoutId: key,
        orderId: 50,
      });
      expect(ports[4].execute).toHaveBeenCalledTimes(2);
    } finally {
      bounded.onApplicationShutdown();
    }
  });
  it('maps an unavailable service to 503', async () => {
    const missing = new CartGatewayClient(
      new ConfigService({ CART_GRPC_URL: await freeAddress() }),
    );
    missing.onModuleInit();
    try {
      await expect(missing.getActiveCart(10)).rejects.toMatchObject({ status: 503 });
    } finally {
      missing.onApplicationShutdown();
    }
  });
});
