import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { ConfigService } from '@nestjs/config';
import { ClientGrpc, ClientProxyFactory, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { Observable, firstValueFrom } from 'rxjs';
import { OrderCreationFailedError } from '../../domain/errors/order-creation-failed.error';
import {
  OrderCreateItem,
  OrderCreateResult,
  OrderCheckoutIdentity,
  OrderCreatorPort,
} from '../../application/ports/order-creator.port';

interface CloseableClientGrpc extends ClientGrpc {
  close?: () => void;
}

interface CreateOrderGrpcRequest {
  user_id: string;
  checkout_id?: string;
  cart_id?: string;
  request_hash?: string;
  request_hash_version?: number;
  items: Array<{
    product_sku_id: string;
    product_name: string;
    price: number;
    quantity: number;
    sku_code: string;
    image_url?: string;
    regular_price?: number;
    price_source?: string;
    flash_sale_id?: string;
    flash_sale_item_id?: string;
    sale_ends_at?: string;
  }>;
}

interface CreateOrderGrpcResponse {
  order_id: string;
  status: string;
}

interface GetOrderByCheckoutIdGrpcRequest {
  checkout_id: string;
}

interface OrderGrpcService {
  createOrder(request: CreateOrderGrpcRequest): Observable<CreateOrderGrpcResponse>;
  getOrderByCheckoutId(
    request: GetOrderByCheckoutIdGrpcRequest,
  ): Observable<CreateOrderGrpcResponse>;
}

@Injectable()
export class OrderGrpcCreatorClient implements OrderCreatorPort, OnModuleInit, OnModuleDestroy {
  private client?: CloseableClientGrpc;
  private orderService?: OrderGrpcService;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.client = this.createClient();
    this.orderService = this.client.getService<OrderGrpcService>('OrderService');
  }

  onModuleDestroy(): void {
    this.client?.close?.();
  }

  async createOrder(
    userId: bigint,
    items: OrderCreateItem[],
    checkoutIdentity?: OrderCheckoutIdentity,
  ): Promise<OrderCreateResult> {
    try {
      const response = await firstValueFrom(
        this.getOrderService().createOrder(toGrpcRequest(userId, items, checkoutIdentity)),
      );
      const orderId = BigInt(response.order_id);

      if (response.status !== 'CREATED' || orderId <= 0n) {
        throw new OrderCreationFailedError(
          response.status || 'Order creation failed.',
          'UNCERTAIN',
        );
      }

      return {
        orderId,
        status: response.status,
      };
    } catch (error) {
      if (error instanceof OrderCreationFailedError) {
        throw error;
      }

      throw new OrderCreationFailedError(
        grpcErrorMessage(error, 'Order service request failed.'),
        isDefiniteOrderError(error) ? 'DEFINITE' : 'UNCERTAIN',
      );
    }
  }

  async getOrderByCheckoutId(checkoutId: string): Promise<OrderCreateResult> {
    try {
      const response = await firstValueFrom(
        this.getOrderService().getOrderByCheckoutId({
          checkout_id: checkoutId,
        }),
      );
      const orderId = BigInt(response.order_id);

      if (!response.status || orderId <= 0n) {
        throw new OrderCreationFailedError('Order lookup returned invalid data.', 'UNCERTAIN');
      }

      return {
        orderId,
        status: response.status,
      };
    } catch (error) {
      if (error instanceof OrderCreationFailedError) {
        throw error;
      }

      if (grpcErrorCode(error) === GrpcStatus.NOT_FOUND) {
        throw new OrderCreationFailedError(
          grpcErrorMessage(error, 'Order was not found.'),
          'NOT_FOUND',
        );
      }

      throw new OrderCreationFailedError(
        grpcErrorMessage(error, 'Order service lookup failed.'),
        isDefiniteOrderError(error) ? 'DEFINITE' : 'UNCERTAIN',
      );
    }
  }

  protected createClient(): CloseableClientGrpc {
    return ClientProxyFactory.create({
      transport: Transport.GRPC,
      options: {
        package: 'order',
        protoPath: join(process.cwd(), 'libs/proto/order.proto'),
        url: this.configService.get<string>('ORDER_GRPC_URL') ?? 'localhost:9004',
        loader: {
          keepCase: true,
          longs: String,
        },
      },
    }) as CloseableClientGrpc;
  }

  private getOrderService(): OrderGrpcService {
    if (!this.orderService) {
      throw new OrderCreationFailedError('Order gRPC client is not initialized.', 'UNCERTAIN');
    }

    return this.orderService;
  }
}

function grpcErrorCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }

  return typeof error.code === 'number' ? error.code : undefined;
}

function grpcErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null) {
    return fallback;
  }

  if ('details' in error && typeof error.details === 'string') {
    return error.details;
  }

  return error instanceof Error ? error.message : fallback;
}

function isDefiniteOrderError(error: unknown): boolean {
  return [
    GrpcStatus.INVALID_ARGUMENT,
    GrpcStatus.ALREADY_EXISTS,
    GrpcStatus.FAILED_PRECONDITION,
  ].includes(grpcErrorCode(error) ?? -1);
}

function toGrpcRequest(
  userId: bigint,
  items: OrderCreateItem[],
  checkoutIdentity?: OrderCheckoutIdentity,
): CreateOrderGrpcRequest {
  return {
    user_id: userId.toString(),
    ...(checkoutIdentity
      ? {
          checkout_id: checkoutIdentity.checkoutId,
          cart_id: checkoutIdentity.cartId.toString(),
          request_hash: checkoutIdentity.requestHash,
          request_hash_version: checkoutIdentity.requestHashVersion,
        }
      : {}),
    items: items.map((item) => ({
      product_sku_id: item.productSkuId.toString(),
      product_name: item.productName,
      price: item.price,
      quantity: item.quantity,
      sku_code: item.skuCode,
      image_url: item.imageUrl ?? '',
      regular_price: item.regularPrice,
      price_source: item.priceSource,
      flash_sale_id: item.flashSaleId?.toString(),
      flash_sale_item_id: item.flashSaleItemId?.toString(),
      sale_ends_at: item.saleEndsAt ?? undefined,
    })),
  };
}
