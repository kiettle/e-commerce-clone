import {
  Injectable,
  OnModuleInit,
  OnApplicationShutdown,
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientGrpc, ClientProxyFactory, Transport } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { firstValueFrom, Observable } from 'rxjs';
import { join } from 'node:path';
import { grpcDeadline, grpcTimeoutMs, grpcHttpError } from '@app/common';
import type {
  CartGrpcService,
  CartResponse,
  CheckoutCartResponse,
  CheckoutStatusResponse,
} from '../../../../../../libs/proto/cart.types';
import {
  AddCartItemRequestDto,
  UpdateCartItemRequestDto,
  CartResponseDto,
  CheckoutCartResponseDto,
  CheckoutPendingResponseDto,
  CheckoutStatusResponseDto,
  GatewayCartItemPriceSource,
  GatewayCheckoutStatus,
} from '../../presentation/http/dto/cart.dto';

interface CloseableClientGrpc extends ClientGrpc {
  close(): void;
}

@Injectable()
export class CartGatewayClient implements OnModuleInit, OnApplicationShutdown {
  private client?: CloseableClientGrpc;
  private service?: CartGrpcService;
  private readonly timeoutMs: number;
  private readonly checkoutTimeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.timeoutMs = grpcTimeoutMs(config.get('GRPC_REQUEST_TIMEOUT_MS', 5000));
    this.checkoutTimeoutMs = grpcTimeoutMs(
      config.get('GATEWAY_CHECKOUT_TIMEOUT_MS', 30000),
      'GATEWAY_CHECKOUT_TIMEOUT_MS',
    );
    if (this.checkoutTimeoutMs <= this.timeoutMs) {
      throw new Error('GATEWAY_CHECKOUT_TIMEOUT_MS must exceed GRPC_REQUEST_TIMEOUT_MS.');
    }
  }
  onModuleInit(): void {
    this.client = this.createClient();
    this.service = this.client.getService<CartGrpcService>('CartService');
  }
  onApplicationShutdown(): void {
    this.client?.close();
  }
  protected createClient(): CloseableClientGrpc {
    return ClientProxyFactory.create({
      transport: Transport.GRPC,
      options: {
        package: 'cart',
        protoPath: join(process.cwd(), 'libs/proto/cart.proto'),
        url:
          this.config.get<string>('CART_GRPC_URL') ??
          `localhost:${this.config.get('CART_GRPC_PORT', 9002)}`,
        loader: { keepCase: true, longs: String, defaults: true, oneofs: true },
      },
    }) as CloseableClientGrpc;
  }
  private getService(): CartGrpcService {
    if (!this.service)
      throw new ServiceUnavailableException('Cart gRPC client is not initialized.');
    return this.service;
  }
  private async call<T>(operation: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(operation);
    } catch (error) {
      throw grpcHttpError(error, 'Cart service');
    }
  }
  async getActiveCart(userId: number): Promise<CartResponseDto> {
    return toCartResponse(
      await this.call(
        this.getService().getActiveCart(
          { user_id: requestId(userId) },
          new Metadata(),
          grpcDeadline(this.timeoutMs),
        ),
      ),
    );
  }
  async addCartItem(userId: number, body: AddCartItemRequestDto): Promise<CartResponseDto> {
    return toCartResponse(
      await this.call(
        this.getService().addCartItem(
          {
            user_id: requestId(userId),
            product_sku_id: requestId(body.productSkuId),
            quantity: requestQuantity(body.quantity, 1),
          },
          new Metadata(),
          grpcDeadline(this.timeoutMs),
        ),
      ),
    );
  }
  async updateCartItem(
    userId: number,
    cartItemId: number,
    body: UpdateCartItemRequestDto,
  ): Promise<CartResponseDto> {
    return toCartResponse(
      await this.call(
        this.getService().updateCartItem(
          {
            user_id: requestId(userId),
            cart_item_id: requestId(cartItemId),
            quantity: requestQuantity(body.quantity, 0),
          },
          new Metadata(),
          grpcDeadline(this.timeoutMs),
        ),
      ),
    );
  }
  async deleteCartItem(userId: number, cartItemId: number): Promise<CartResponseDto> {
    return toCartResponse(
      await this.call(
        this.getService().deleteCartItem(
          { user_id: requestId(userId), cart_item_id: requestId(cartItemId) },
          new Metadata(),
          grpcDeadline(this.timeoutMs),
        ),
      ),
    );
  }
  async checkoutCart(
    userId: number,
    cartId: number,
    idempotencyKey: string,
  ): Promise<CheckoutCartResponseDto | CheckoutPendingResponseDto> {
    const response: CheckoutCartResponse = await this.call(
      this.getService().checkoutCart(
        { user_id: requestId(userId), cart_id: requestId(cartId), idempotency_key: idempotencyKey },
        new Metadata(),
        grpcDeadline(this.checkoutTimeoutMs),
      ),
    );
    if (response.completed && !response.pending && response.completed.cart) {
      return {
        checkoutId: response.completed.checkout_id,
        status: 'COMPLETED',
        orderId: publicId(response.completed.order_id),
        cart: toCartResponse(response.completed.cart),
      };
    }
    if (response.pending && !response.completed) {
      return { checkoutId: response.pending.checkout_id, status: 'RECONCILIATION_REQUIRED' };
    }
    throw new BadGatewayException('Cart service returned an invalid checkout outcome.');
  }
  async getCheckoutStatus(userId: number, checkoutId: string): Promise<CheckoutStatusResponseDto> {
    const response: CheckoutStatusResponse = await this.call(
      this.getService().getCheckoutStatus(
        { user_id: requestId(userId), checkout_id: checkoutId },
        new Metadata(),
        grpcDeadline(this.timeoutMs),
      ),
    );
    return {
      checkoutId: response.checkout_id,
      cartId: publicId(response.cart_id),
      status: response.status as GatewayCheckoutStatus,
      orderId: response.order_id == null ? null : publicId(response.order_id),
      lastError: response.last_error ?? null,
      createdAt: response.created_at,
      updatedAt: response.updated_at,
    };
  }
}

export function toCartResponse(cart: CartResponse): CartResponseDto {
  return {
    id: publicId(cart.id),
    userId: publicId(cart.user_id),
    status: cart.status,
    totalAmount: cart.total_amount,
    items: (cart.items ?? []).map((item) => ({
      id: publicId(item.id),
      cartId: publicId(item.cart_id),
      productId: publicId(item.product_id),
      productName: item.product_name,
      imageUrl: item.image_url ?? null,
      productSkuId: publicId(item.product_sku_id),
      skuCode: item.sku_code,
      price: item.price,
      regularPrice: item.regular_price,
      priceSource: item.price_source as GatewayCartItemPriceSource,
      flashSaleId: item.flash_sale_id == null ? null : publicId(item.flash_sale_id),
      flashSaleItemId: item.flash_sale_item_id == null ? null : publicId(item.flash_sale_item_id),
      saleEndsAt: item.sale_ends_at ?? null,
      maxQuantityPerUser: item.max_quantity_per_user ?? null,
      quantity: item.quantity,
      subtotal: item.subtotal,
    })),
  };
}
function publicId(value: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0)
    throw new BadGatewayException('Cart service returned an invalid identifier.');
  return number;
}
function requestId(value: number): string {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new BadRequestException('Identifier must be a positive safe integer.');
  return String(value);
}
function requestQuantity(value: number, minimum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > 2147483647) {
    throw new BadRequestException('Quantity is outside the supported integer range.');
  }
  return value;
}
