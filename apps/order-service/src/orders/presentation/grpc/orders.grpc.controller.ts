import { Controller, Logger } from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { CreateOrderUseCase } from '../../application/use-cases/create-order.use-case';
import { GetOrderByCheckoutIdUseCase } from '../../application/use-cases/get-order-by-checkout-id.use-case';
import { CheckoutIdConflictError } from '../../domain/errors/checkout-id-conflict.error';
import { InvalidOrderError } from '../../domain/errors/invalid-order.error';
import { InvalidOrderStateError } from '../../domain/errors/invalid-order-state.error';
import { OrderNotFoundError } from '../../domain/errors/order-not-found.error';

interface CreateOrderGrpcRequest {
  user_id: string;
  checkout_id?: string;
  cart_id?: string;
  request_hash?: string;
  items: Array<{
    product_sku_id: string;
    product_name: string;
    price: number;
    quantity: number;
    sku_code?: string;
    image_url?: string;
  }>;
}

interface CreateOrderGrpcResponse {
  order_id: string;
  status: string;
}

interface GetOrderByCheckoutIdGrpcRequest {
  checkout_id: string;
}

@Controller()
export class OrdersGrpcController {
  private readonly logger = new Logger(OrdersGrpcController.name);

  constructor(
    private readonly createOrderUseCase: CreateOrderUseCase,
    private readonly getOrderByCheckoutIdUseCase: GetOrderByCheckoutIdUseCase,
  ) {}

  @GrpcMethod('OrderService', 'CreateOrder')
  async createOrder(
    request: CreateOrderGrpcRequest,
  ): Promise<CreateOrderGrpcResponse> {
    try {
      const order = await this.createOrderUseCase.execute({
        userId: BigInt(request.user_id),
        checkoutId: request.checkout_id,
        cartId: request.cart_id ? BigInt(request.cart_id) : undefined,
        requestHash: request.request_hash,
        items: request.items.map((item) => ({
          productSkuId: BigInt(item.product_sku_id),
          productName: item.product_name,
          price: item.price,
          quantity: item.quantity,
          skuCode: item.sku_code,
          imageUrl: item.image_url || null,
        })),
      });

      return toGrpcResponse(order);
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  @GrpcMethod('OrderService', 'GetOrderByCheckoutId')
  async getOrderByCheckoutId(
    request: GetOrderByCheckoutIdGrpcRequest,
  ): Promise<CreateOrderGrpcResponse> {
    try {
      const order = await this.getOrderByCheckoutIdUseCase.execute(
        request.checkout_id,
      );

      return toGrpcResponse(order);
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  private toRpcException(error: unknown): RpcException {
    if (error instanceof InvalidOrderError) {
      return createRpcException(GrpcStatus.INVALID_ARGUMENT, error.message);
    }

    if (error instanceof CheckoutIdConflictError) {
      return createRpcException(GrpcStatus.ALREADY_EXISTS, error.message);
    }

    if (error instanceof OrderNotFoundError) {
      return createRpcException(GrpcStatus.NOT_FOUND, error.message);
    }

    if (error instanceof InvalidOrderStateError) {
      return createRpcException(GrpcStatus.FAILED_PRECONDITION, error.message);
    }

    this.logger.error('Order gRPC request failed.', error);
    return createRpcException(
      GrpcStatus.UNAVAILABLE,
      'Order service is unavailable.',
    );
  }
}

function toGrpcResponse(order: {
  id: bigint;
  status: string;
}): CreateOrderGrpcResponse {
  return {
    order_id: order.id.toString(),
    status: order.status,
  };
}

function createRpcException(code: GrpcStatus, message: string): RpcException {
  return new RpcException({ code, message });
}
