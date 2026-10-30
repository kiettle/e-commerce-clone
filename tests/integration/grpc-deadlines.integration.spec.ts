import { ConfigService } from '@nestjs/config';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';
import { startFakeGrpcServer, type FakeGrpcServer } from './support/fake-grpc-server';
import { AuthGrpcClient } from '../../apps/gateway/src/auth/infrastructure/grpc/auth-grpc.client';
import { CatalogGatewayClient } from '../../apps/gateway/src/catalog/infrastructure/grpc/catalog-gateway.client';
import { ProductGrpcCatalogClient } from '../../apps/cart-service/src/carts/infrastructure/grpc/product-grpc-catalog.client';
import { InventoryGrpcStockClient } from '../../apps/cart-service/src/carts/infrastructure/grpc/inventory-grpc-stock.client';
import { OrderGrpcCreatorClient } from '../../apps/cart-service/src/carts/infrastructure/grpc/order-grpc-creator.client';

describe('native deadlines on existing internal RPC clients', () => {
  const servers: FakeGrpcServer[] = [];
  const clients: Array<{ onApplicationShutdown(): void }> = [];
  afterEach(async () => {
    clients.splice(0).forEach((client) => client.onApplicationShutdown());
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });
  async function config(
    file: string,
    packageName: string,
    serviceName: string,
    method: string,
    env: string,
  ) {
    const handler = vi.fn(() => undefined); // Never replies: only an actual client deadline can complete the call.
    const server = await startFakeGrpcServer({
      protoPath: join(process.cwd(), 'libs/proto', file),
      packageName,
      serviceName,
      implementation: { [method]: handler },
    });
    servers.push(server);
    return {
      settings: new ConfigService({ [env]: server.url, GRPC_REQUEST_TIMEOUT_MS: 80 }),
      handler,
    };
  }
  it('bounds auth validation and product search with HTTP 504', async () => {
    const auth = await config(
      'auth.proto',
      'auth',
      'AuthService',
      'validateToken',
      'AUTH_GRPC_URL',
    );
    const client = new AuthGrpcClient(auth.settings);
    clients.push(client);
    client.onModuleInit();
    await expect(client.validateToken('token')).rejects.toMatchObject({ status: 504 });
    expect(auth.handler).toHaveBeenCalledOnce();
    const product = await config(
      'product.proto',
      'product',
      'ProductService',
      'searchProducts',
      'PRODUCT_GRPC_URL',
    );
    const catalog = new CatalogGatewayClient(product.settings);
    clients.push(catalog);
    catalog.onModuleInit();
    await expect(catalog.searchProducts({})).rejects.toMatchObject({ status: 504 });
    expect(product.handler).toHaveBeenCalledOnce();
  });
  it('bounds snapshot reads without reporting a product as missing', async () => {
    const { settings, handler } = await config(
      'product.proto',
      'product',
      'ProductService',
      'getProductSkuSnapshot',
      'PRODUCT_GRPC_URL',
    );
    const client = new ProductGrpcCatalogClient(settings);
    clients.push(client);
    client.onModuleInit();
    await expect(client.getProductSkuSnapshot(100n)).rejects.toMatchObject({
      name: 'ProductSnapshotUnavailableError',
    });
    expect(handler).toHaveBeenCalledOnce();
  });
  it('classifies inventory and order timeouts as uncertain instead of definite rejections', async () => {
    const inventory = await config(
      'inventory.proto',
      'inventory',
      'InventoryService',
      'reserveStock',
      'INVENTORY_GRPC_URL',
    );
    const stock = new InventoryGrpcStockClient(inventory.settings);
    clients.push(stock);
    stock.onModuleInit();
    await expect(
      stock.reserveStock({
        cartId: 20n,
        userId: 10n,
        checkoutId: 'id',
        items: [{ productSkuId: 100n, quantity: 1 }],
      }),
    ).rejects.toMatchObject({ outcome: 'UNCERTAIN' });
    expect(inventory.handler).toHaveBeenCalledOnce();
    const order = await config(
      'order.proto',
      'order',
      'OrderService',
      'createOrder',
      'ORDER_GRPC_URL',
    );
    const orders = new OrderGrpcCreatorClient(order.settings);
    clients.push(orders);
    orders.onModuleInit();
    await expect(orders.createOrder(10n, [])).rejects.toMatchObject({ outcome: 'UNCERTAIN' });
    expect(order.handler).toHaveBeenCalledOnce();
  });
});
