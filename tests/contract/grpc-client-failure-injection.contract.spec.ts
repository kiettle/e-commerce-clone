import {
  handleUnaryCall,
  sendUnaryData,
  ServerUnaryCall,
  ServiceError,
  status as GrpcStatus,
  UntypedServiceImplementation,
} from '@grpc/grpc-js';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthGrpcClient } from '../../apps/gateway/src/auth/infrastructure/grpc/auth-grpc.client';
import { UserRole } from '../../apps/gateway/src/common/enums/user-role.enum';
import { InventoryCommitFailedError } from '../../apps/cart-service/src/carts/domain/errors/inventory-commit-failed.error';
import { InventoryReservationFailedError } from '../../apps/cart-service/src/carts/domain/errors/inventory-reservation-failed.error';
import { OrderCreationFailedError } from '../../apps/cart-service/src/carts/domain/errors/order-creation-failed.error';
import { InventoryGrpcStockClient } from '../../apps/cart-service/src/carts/infrastructure/grpc/inventory-grpc-stock.client';
import { OrderGrpcCreatorClient } from '../../apps/cart-service/src/carts/infrastructure/grpc/order-grpc-creator.client';
import { FakeGrpcServer, startFakeGrpcServer } from './support/fake-grpc-server';

type FailureMode =
  | 'SUCCESS'
  | 'BUSINESS_REJECTION'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'DEADLINE_EXCEEDED'
  | 'UNAVAILABLE'
  | 'LOST_RESPONSE';

describe('gRPC client contracts with controlled dependency servers', () => {
  const servers: FakeGrpcServer[] = [];
  const clients: Array<{ onModuleDestroy(): void }> = [];

  afterEach(async () => {
    for (const client of clients.splice(0).reverse()) {
      client.onModuleDestroy();
    }
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it('validates auth tokens and propagates the server-owned role', async () => {
    let receivedToken = '';
    const server = await fakeServer('auth.proto', 'auth', 'AuthService', {
      login: unary((_request, callback) =>
        callback(null, { success: true, token: 'signed-token', message: 'OK' }),
      ),
      validateToken: unary((request: { token: string }, callback) => {
        receivedToken = request.token;
        callback(null, {
          is_valid: true,
          user_id: '42',
          message: 'OK',
          role: 'ADMIN',
        });
      }),
    });
    const client = trackClient(new AuthGrpcClient(config({ AUTH_GRPC_URL: server.url })));
    client.onModuleInit();

    await expect(client.validateToken('caller-token')).resolves.toEqual({
      userId: 42,
      role: UserRole.Admin,
    });
    expect(receivedToken).toBe('caller-token');
  });

  it('maps an unauthenticated token response to an authentication failure', async () => {
    const server = await fakeServer('auth.proto', 'auth', 'AuthService', {
      login: unary((_request, callback) => callback(grpcError(GrpcStatus.UNAUTHENTICATED))),
      validateToken: unary((_request, callback) =>
        callback(grpcError(GrpcStatus.UNAUTHENTICATED, 'Token expired.')),
      ),
    });
    const client = trackClient(new AuthGrpcClient(config({ AUTH_GRPC_URL: server.url })));
    client.onModuleInit();

    await expect(client.validateToken('expired-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('round-trips reserve, release, commit, and sale identity without int64 precision loss', async () => {
    const received: Array<{ operation: string; request: StockOperationWireRequest }> = [];
    const implementation = inventoryImplementation(
      () => 'SUCCESS',
      (operation, request) => received.push({ operation, request }),
    );
    const server = await fakeServer(
      'inventory.proto',
      'inventory',
      'InventoryService',
      implementation,
    );
    const client = trackClient(
      new InventoryGrpcStockClient(config({ INVENTORY_GRPC_URL: server.url })),
    );
    client.onModuleInit();
    const request = stockRequest();

    await expect(client.reserveStock(request)).resolves.toBeUndefined();
    await expect(client.releaseStock(request)).resolves.toBeUndefined();
    await expect(client.commitStock(request)).resolves.toBeUndefined();

    expect(received.map(({ operation }) => operation)).toEqual([
      'ReserveStock',
      'ReleaseStock',
      'CommitStock',
    ]);
    expect(received[0].request).toEqual({
      cart_id: '9223372036854775807',
      checkout_id: '550e8400-e29b-41d4-a716-446655440020',
      user_id: '9007199254740993',
      items: [
        {
          product_sku_id: '9007199254740995',
          quantity: 1,
          flash_sale_id: '9007199254740997',
          flash_sale_item_id: '9007199254740999',
        },
      ],
    });
  });

  it('keeps business inventory rejection definite and transport outcomes uncertain', async () => {
    let mode: FailureMode = 'BUSINESS_REJECTION';
    let appliedReservations = 0;
    const server = await fakeServer(
      'inventory.proto',
      'inventory',
      'InventoryService',
      inventoryImplementation(
        () => mode,
        (operation) => {
          if (operation === 'ReserveStock' && mode === 'LOST_RESPONSE') {
            appliedReservations += 1;
          }
        },
      ),
    );
    const client = trackClient(
      new InventoryGrpcStockClient(config({ INVENTORY_GRPC_URL: server.url })),
    );
    client.onModuleInit();

    await expect(client.reserveStock(stockRequest())).rejects.toMatchObject({
      outcome: 'DEFINITE',
      code: 'FLASH_SALE_SOLD_OUT',
    } satisfies Partial<InventoryReservationFailedError>);

    for (const uncertainMode of ['DEADLINE_EXCEEDED', 'UNAVAILABLE', 'LOST_RESPONSE'] as const) {
      mode = uncertainMode;
      await expect(client.reserveStock(stockRequest())).rejects.toMatchObject({
        outcome: 'UNCERTAIN',
      } satisfies Partial<InventoryReservationFailedError>);
    }
    expect(appliedReservations).toBe(1);

    mode = 'UNAVAILABLE';
    await expect(client.commitStock(stockRequest())).rejects.toMatchObject({
      outcome: 'UNCERTAIN',
    } satisfies Partial<InventoryCommitFailedError>);
  });

  it('round-trips order creation, lookup, hash version, and sale snapshot fields', async () => {
    const requests: OrderWireRequest[] = [];
    const server = await fakeServer(
      'order.proto',
      'order',
      'OrderService',
      orderImplementation(() => 'SUCCESS', requests),
    );
    const client = trackClient(new OrderGrpcCreatorClient(config({ ORDER_GRPC_URL: server.url })));
    client.onModuleInit();

    const created = await client.createOrder(
      9_007_199_254_740_993n,
      [
        {
          productSkuId: 9_007_199_254_740_995n,
          productName: 'Sale Keyboard',
          skuCode: 'SALE-SKU',
          imageUrl: null,
          price: 19.9,
          quantity: 1,
          regularPrice: 39.9,
          priceSource: 'FLASH_SALE',
          flashSaleId: 9_007_199_254_740_997n,
          flashSaleItemId: 9_007_199_254_740_999n,
          saleEndsAt: '2026-09-21T11:00:00.000Z',
        },
      ],
      {
        checkoutId: '550e8400-e29b-41d4-a716-446655440021',
        cartId: 9_223_372_036_854_775_807n,
        requestHash: 'c'.repeat(64),
        requestHashVersion: 2,
      },
    );
    const lookedUp = await client.getOrderByCheckoutId('550e8400-e29b-41d4-a716-446655440021');

    expect(created.orderId).toBe(9_223_372_036_854_775_807n);
    expect(lookedUp.orderId).toBe(9_223_372_036_854_775_807n);
    expect(requests[0]).toMatchObject({
      user_id: '9007199254740993',
      cart_id: '9223372036854775807',
      request_hash_version: 2,
      items: [
        expect.objectContaining({
          product_sku_id: '9007199254740995',
          flash_sale_id: '9007199254740997',
          flash_sale_item_id: '9007199254740999',
        }),
      ],
    });
  });

  it('classifies order status codes and lost responses by certainty', async () => {
    let mode: FailureMode = 'BUSINESS_REJECTION';
    let appliedOrders = 0;
    const server = await fakeServer(
      'order.proto',
      'order',
      'OrderService',
      orderImplementation(
        () => mode,
        [],
        () => {
          appliedOrders += 1;
        },
      ),
    );
    const client = trackClient(new OrderGrpcCreatorClient(config({ ORDER_GRPC_URL: server.url })));
    client.onModuleInit();

    for (const definiteMode of ['BUSINESS_REJECTION', 'ALREADY_EXISTS'] as const) {
      mode = definiteMode;
      await expect(createOrder(client)).rejects.toMatchObject({
        outcome: 'DEFINITE',
      } satisfies Partial<OrderCreationFailedError>);
    }

    mode = 'NOT_FOUND';
    await expect(
      client.getOrderByCheckoutId('550e8400-e29b-41d4-a716-446655440022'),
    ).rejects.toMatchObject({ outcome: 'NOT_FOUND' } satisfies Partial<OrderCreationFailedError>);

    for (const uncertainMode of ['DEADLINE_EXCEEDED', 'UNAVAILABLE', 'LOST_RESPONSE'] as const) {
      mode = uncertainMode;
      await expect(createOrder(client)).rejects.toMatchObject({
        outcome: 'UNCERTAIN',
      } satisfies Partial<OrderCreationFailedError>);
    }
    expect(appliedOrders).toBe(1);
  });

  async function fakeServer(
    protoFile: string,
    packageName: string,
    serviceName: string,
    implementation: UntypedServiceImplementation,
  ): Promise<FakeGrpcServer> {
    const server = await startFakeGrpcServer({
      protoPath: join(process.cwd(), 'libs/proto', protoFile),
      packageName,
      serviceName,
      implementation,
    });
    servers.push(server);
    return server;
  }

  function trackClient<T extends { onModuleDestroy(): void }>(client: T): T {
    clients.push(client);
    return client;
  }
});

interface StockOperationWireRequest {
  cart_id: string;
  checkout_id: string;
  user_id: string;
  items: Array<{
    product_sku_id: string;
    quantity: number;
    flash_sale_id?: string;
    flash_sale_item_id?: string;
  }>;
}

interface OrderWireRequest {
  user_id?: string;
  checkout_id: string;
  cart_id?: string;
  request_hash?: string;
  request_hash_version?: number;
  items?: Array<{
    product_sku_id: string;
    flash_sale_id?: string;
    flash_sale_item_id?: string;
  }>;
}

function inventoryImplementation(
  getMode: () => FailureMode,
  onRequest: (operation: string, request: StockOperationWireRequest) => void,
): UntypedServiceImplementation {
  const handle = (operation: string): handleUnaryCall<StockOperationWireRequest, object> =>
    unary((request, callback) => {
      const mode = getMode();
      onRequest(operation, request);
      if (mode === 'SUCCESS') {
        callback(null, { success: true, message: 'OK', error_code: '' });
        return;
      }
      if (mode === 'BUSINESS_REJECTION') {
        callback(null, {
          success: false,
          message: 'Sale allocation exhausted.',
          error_code: 'FLASH_SALE_SOLD_OUT',
        });
        return;
      }
      callback(grpcError(statusFor(mode)));
    });

  return {
    reserveStock: handle('ReserveStock'),
    releaseStock: handle('ReleaseStock'),
    commitStock: handle('CommitStock'),
  };
}

function orderImplementation(
  getMode: () => FailureMode,
  requests: OrderWireRequest[],
  onLostResponse: () => void = () => undefined,
): UntypedServiceImplementation {
  const handle = (request: OrderWireRequest, callback: sendUnaryData<object>): void => {
    const mode = getMode();
    requests.push(request);
    if (mode === 'SUCCESS') {
      callback(null, { order_id: '9223372036854775807', status: 'CREATED' });
      return;
    }
    if (mode === 'LOST_RESPONSE') {
      onLostResponse();
    }
    callback(grpcError(statusFor(mode)));
  };

  return {
    createOrder: unary(handle),
    getOrderByCheckoutId: unary(handle),
  };
}

function stockRequest() {
  return {
    cartId: 9_223_372_036_854_775_807n,
    checkoutId: '550e8400-e29b-41d4-a716-446655440020',
    userId: 9_007_199_254_740_993n,
    items: [
      {
        productSkuId: 9_007_199_254_740_995n,
        quantity: 1,
        flashSaleId: 9_007_199_254_740_997n,
        flashSaleItemId: 9_007_199_254_740_999n,
      },
    ],
  };
}

function createOrder(client: OrderGrpcCreatorClient) {
  return client.createOrder(
    10n,
    [
      {
        productSkuId: 100n,
        productName: 'Keyboard',
        skuCode: 'KEYBOARD',
        price: 20,
        quantity: 1,
      },
    ],
    {
      checkoutId: '550e8400-e29b-41d4-a716-446655440022',
      cartId: 20n,
      requestHash: 'd'.repeat(64),
      requestHashVersion: 2,
    },
  );
}

function statusFor(mode: FailureMode): GrpcStatus {
  switch (mode) {
    case 'BUSINESS_REJECTION':
      return GrpcStatus.FAILED_PRECONDITION;
    case 'NOT_FOUND':
      return GrpcStatus.NOT_FOUND;
    case 'ALREADY_EXISTS':
      return GrpcStatus.ALREADY_EXISTS;
    case 'DEADLINE_EXCEEDED':
    case 'LOST_RESPONSE':
      return GrpcStatus.DEADLINE_EXCEEDED;
    case 'UNAVAILABLE':
      return GrpcStatus.UNAVAILABLE;
    default:
      throw new Error(`Mode ${mode} does not represent a gRPC failure.`);
  }
}

function grpcError(code: GrpcStatus, details = GrpcStatus[code]): ServiceError {
  return Object.assign(new Error(details), { code, details }) as ServiceError;
}

function unary<Request extends object, Response extends object>(
  handler: (request: Request, callback: sendUnaryData<Response>) => void,
): handleUnaryCall<Request, Response> {
  return (call: ServerUnaryCall<Request, Response>, callback: sendUnaryData<Response>) =>
    handler(call.request, callback);
}

function config(values: Record<string, string>): ConfigService {
  return { get: (name: string) => values[name] } as ConfigService;
}
