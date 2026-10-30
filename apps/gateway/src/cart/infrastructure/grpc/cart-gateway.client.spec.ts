import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import { describe, it, expect, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { status } from '@grpc/grpc-js';
import { CartGatewayClient, toCartResponse } from './cart-gateway.client';

function setup() {
  const service = {
    getActiveCart: vi.fn(),
    addCartItem: vi.fn(),
    deleteCartItem: vi.fn(),
    checkoutCart: vi.fn(),
    getCheckoutStatus: vi.fn(),
    updateCartItem: vi.fn(),
  };
  const close = vi.fn();
  class Client extends CartGatewayClient {
    protected createClient() {
      return { getService: () => service, close } as any;
    }
  }
  const client = new Client(new ConfigService());
  client.onModuleInit();
  return { client, service, close };
}
describe('gateway cart gRPC adapter', () => {
  it('forwards the exact key and sets the longer checkout deadline', async () => {
    const { client, service } = setup();
    service.checkoutCart.mockReturnValue(of({ pending: { checkout_id: 'id' } }));
    const before = Date.now();
    await expect(client.checkoutCart(10, 20, 'original-key')).resolves.toEqual({
      checkoutId: 'id',
      status: 'RECONCILIATION_REQUIRED',
    });
    const [request, , options] = service.checkoutCart.mock.calls[0];
    expect(request).toEqual({ user_id: '10', cart_id: '20', idempotency_key: 'original-key' });
    expect(options.deadline.getTime()).toBeGreaterThanOrEqual(before + 30000);
  });
  it('turns a deadline into 504 without inventing a pending checkout or retrying', async () => {
    const { client, service } = setup();
    service.checkoutCart.mockReturnValue(throwError(() => ({ code: status.DEADLINE_EXCEEDED })));
    await expect(client.checkoutCart(10, 20, 'key')).rejects.toMatchObject({ status: 504 });
    expect(service.checkoutCart).toHaveBeenCalledTimes(1);
  });
  it('rejects oversized quantities before protobuf encoding can truncate them', async () => {
    const { client, service } = setup();
    await expect(client.updateCartItem(10, 30, { quantity: 4294967297 })).rejects.toMatchObject({
      status: 400,
    });
    expect(service.updateCartItem).not.toHaveBeenCalled();
  });
  it('rejects unsafe public identifiers and restores empty carts', () => {
    expect(() =>
      toCartResponse({
        id: '9007199254740993',
        user_id: '10',
        status: 'ACTIVE',
        total_amount: 0,
        items: [],
      }),
    ).toThrow('invalid identifier');
    expect(
      toCartResponse({ id: '20', user_id: '10', status: 'ACTIVE', total_amount: 0, items: [] }),
    ).toEqual({ id: 20, userId: 10, status: 'ACTIVE', totalAmount: 0, items: [] });
  });
  it('rejects an ambiguous checkout response', async () => {
    const { client, service } = setup();
    service.checkoutCart.mockReturnValue(of({}));
    await expect(client.checkoutCart(10, 20, 'key')).rejects.toMatchObject({ status: 502 });
  });
  it('closes the channel during application shutdown', () => {
    const { client, close } = setup();
    client.onApplicationShutdown();
    expect(close).toHaveBeenCalledOnce();
  });
  it('rejects a checkout timeout no longer than the ordinary timeout', () => {
    expect(
      () =>
        new CartGatewayClient(
          new ConfigService({ GRPC_REQUEST_TIMEOUT_MS: 5000, GATEWAY_CHECKOUT_TIMEOUT_MS: 5000 }),
        ),
    ).toThrow('must exceed');
  });
});

describe('cart RPC request and public response mapping', () => {
  const cart = {
    id: '20',
    user_id: '10',
    status: 'ACTIVE',
    total_amount: 150,
    items: [
      {
        id: '30',
        cart_id: '20',
        product_id: '90',
        product_name: 'Keyboard',
        product_sku_id: '100',
        sku_code: 'KB',
        price: 75,
        regular_price: 100,
        price_source: 'FLASH_SALE',
        flash_sale_id: '50',
        flash_sale_item_id: '501',
        sale_ends_at: '2026-10-30T12:00:00.000Z',
        max_quantity_per_user: 2,
        quantity: 2,
        subtotal: 150,
      },
    ],
  };
  it('forwards reads and item mutations with identity, zero quantity, and ordinary deadlines', async () => {
    const { client, service } = setup();
    for (const method of [
      service.getActiveCart,
      service.addCartItem,
      service.updateCartItem,
      service.deleteCartItem,
    ])
      method.mockReturnValue(of(cart));
    const before = Date.now();
    const active = await client.getActiveCart(10);
    expect(active.items[0]).toEqual({
      id: 30,
      cartId: 20,
      productId: 90,
      productName: 'Keyboard',
      imageUrl: null,
      productSkuId: 100,
      skuCode: 'KB',
      price: 75,
      regularPrice: 100,
      priceSource: 'FLASH_SALE',
      flashSaleId: 50,
      flashSaleItemId: 501,
      saleEndsAt: '2026-10-30T12:00:00.000Z',
      maxQuantityPerUser: 2,
      quantity: 2,
      subtotal: 150,
    });
    await client.addCartItem(10, { productSkuId: 100, quantity: 2 });
    await client.updateCartItem(10, 30, { quantity: 0 });
    await client.deleteCartItem(10, 30);
    expect(service.addCartItem.mock.calls[0][0]).toEqual({
      user_id: '10',
      product_sku_id: '100',
      quantity: 2,
    });
    expect(service.updateCartItem.mock.calls[0][0]).toEqual({
      user_id: '10',
      cart_item_id: '30',
      quantity: 0,
    });
    expect(service.deleteCartItem.mock.calls[0][0]).toEqual({ user_id: '10', cart_item_id: '30' });
    for (const method of [
      service.getActiveCart,
      service.addCartItem,
      service.updateCartItem,
      service.deleteCartItem,
    ]) {
      expect(method.mock.calls[0][2].deadline.getTime()).toBeGreaterThanOrEqual(before + 5000);
      expect(method).toHaveBeenCalledOnce();
    }
  });
  it('maps completed checkout receipts and status polling without fabricating missing fields', async () => {
    const { client, service } = setup();
    service.checkoutCart.mockReturnValue(
      of({ completed: { checkout_id: 'id', order_id: '50', cart } }),
    );
    expect(await client.checkoutCart(10, 20, 'key')).toMatchObject({
      checkoutId: 'id',
      status: 'COMPLETED',
      orderId: 50,
      cart: { id: 20, totalAmount: 150 },
    });
    service.getCheckoutStatus.mockReturnValue(
      of({
        checkout_id: 'id',
        cart_id: '20',
        status: 'STARTED',
        created_at: 'created',
        updated_at: 'updated',
      }),
    );
    expect(await client.getCheckoutStatus(10, 'id')).toEqual({
      checkoutId: 'id',
      cartId: 20,
      status: 'STARTED',
      orderId: null,
      lastError: null,
      createdAt: 'created',
      updatedAt: 'updated',
    });
    expect(service.getCheckoutStatus.mock.calls[0][0]).toEqual({
      user_id: '10',
      checkout_id: 'id',
    });
  });
  it('rejects unsafe caller IDs before making an RPC', async () => {
    const { client, service } = setup();
    await expect(client.getActiveCart(Number.MAX_SAFE_INTEGER + 1)).rejects.toMatchObject({
      status: 400,
    });
    expect(service.getActiveCart).not.toHaveBeenCalled();
  });
});

it.each([
  [{ CART_GRPC_URL: 'cart.internal:9008', CART_GRPC_PORT: 9009 }, 'cart.internal:9008'],
  [{ CART_GRPC_PORT: 9008 }, 'localhost:9008'],
])('uses the configured cart endpoint with explicit URL precedence', (settings, url) => {
  const channel = { getService: vi.fn().mockReturnValue({}), close: vi.fn() };
  const factory = vi.spyOn(ClientProxyFactory, 'create').mockReturnValue(channel as any);
  try {
    const client = new CartGatewayClient(new ConfigService(settings));
    client.onModuleInit();
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: Transport.GRPC,
        options: expect.objectContaining({
          url,
          loader: { keepCase: true, longs: String, defaults: true, oneofs: true },
        }),
      }),
    );
    expect(channel.getService).toHaveBeenCalledWith('CartService');
    client.onApplicationShutdown();
    expect(channel.close).toHaveBeenCalledOnce();
  } finally {
    factory.mockRestore();
  }
});

it('reports an uninitialized channel as unavailable without sending a request', async () => {
  const client = new CartGatewayClient(new ConfigService());
  await expect(client.getActiveCart(10)).rejects.toMatchObject({ status: 503 });
});
