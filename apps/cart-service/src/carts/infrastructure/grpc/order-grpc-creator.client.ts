import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ClientGrpc,
  ClientProxyFactory,
  Transport,
} from '@nestjs/microservices';
import { join } from 'node:path';
import { Observable, firstValueFrom } from 'rxjs';
import { OrderCreationFailedError } from '../../domain/errors/order-creation-failed.error';
import {
  OrderCreateItem,
  OrderCreateResult,
  OrderCreatorPort,
} from '../../application/ports/order-creator.port';

interface CloseableClientGrpc extends ClientGrpc {
  close?: () => void;
}

interface CreateOrderGrpcRequest {
  user_id: string;
  items: Array<{
    product_sku_id: string;
    product_name: string;
    price: number;
    quantity: number;
    sku_code: string;
    image_url?: string;
  }>;
}

interface CreateOrderGrpcResponse {
  order_id: string;
  status: string;
}

interface OrderGrpcService {
  createOrder(
    request: CreateOrderGrpcRequest,
  ): Observable<CreateOrderGrpcResponse>;
}

@Injectable()
export class OrderGrpcCreatorClient
  implements OrderCreatorPort, OnModuleInit, OnModuleDestroy
{
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
  ): Promise<OrderCreateResult> {
    try {
      const response = await firstValueFrom(
        this.getOrderService().createOrder(toGrpcRequest(userId, items)),
      );
      const orderId = BigInt(response.order_id);

      if (response.status !== 'CREATED' || orderId <= 0n) {
        throw new OrderCreationFailedError(
          response.status || 'Order creation failed.',
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

      throw new OrderCreationFailedError('Order service request failed.');
    }
  }

  protected createClient(): CloseableClientGrpc {
    return ClientProxyFactory.create({
      transport: Transport.GRPC,
      options: {
        package: 'order',
        protoPath: join(process.cwd(), 'libs/proto/order.proto'),
        url:
          this.configService.get<string>('ORDER_GRPC_URL') ?? 'localhost:9004',
        loader: {
          keepCase: true,
          longs: String,
        },
      },
    }) as CloseableClientGrpc;
  }

  private getOrderService(): OrderGrpcService {
    if (!this.orderService) {
      throw new OrderCreationFailedError(
        'Order gRPC client is not initialized.',
      );
    }

    return this.orderService;
  }
}

function toGrpcRequest(
  userId: bigint,
  items: OrderCreateItem[],
): CreateOrderGrpcRequest {
  return {
    user_id: userId.toString(),
    items: items.map((item) => ({
      product_sku_id: item.productSkuId.toString(),
      product_name: item.productName,
      price: item.price,
      quantity: item.quantity,
      sku_code: item.skuCode,
      image_url: item.imageUrl ?? '',
    })),
  };
}
