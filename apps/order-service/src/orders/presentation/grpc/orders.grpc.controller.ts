import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { CreateOrderUseCase } from '../../application/use-cases/create-order.use-case';
import { OrderOperationError } from '../../domain/errors/order-operation.error';

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

@Controller()
export class OrdersGrpcController {
  private readonly logger = new Logger(OrdersGrpcController.name);

  constructor(private readonly createOrderUseCase: CreateOrderUseCase) {}

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

      return {
        order_id: order.id.toString(),
        status: order.status,
      };
    } catch (error) {
      if (error instanceof OrderOperationError) {
        return {
          order_id: '0',
          status: `FAILED: ${error.message}`,
        };
      }

      this.logger.error('Unexpected order gRPC error.', error);
      throw error;
    }
  }
}
