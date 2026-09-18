import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DownstreamHttpClient } from '../../../common/http/downstream-http.client';
import {
  AddCartItemRequestDto,
  CartResponseDto,
  CheckoutCartResponseDto,
  CheckoutPendingResponseDto,
  UpdateCartItemRequestDto,
} from '../../presentation/http/dto/cart.dto';

@Injectable()
export class CartGatewayClient {
  constructor(
    private readonly configService: ConfigService,
    private readonly httpClient: DownstreamHttpClient,
  ) {}

  getActiveCart(userId: number): Promise<CartResponseDto> {
    return this.httpClient.request<CartResponseDto>({
      serviceName: 'cart-service',
      baseUrl: this.getCartServiceUrl(),
      path: '/api/carts/me',
      method: 'GET',
      headers: this.buildUserHeaders(userId),
    });
  }

  checkoutCart(
    userId: number,
    cartId: number,
    idempotencyKey: string,
  ): Promise<CheckoutCartResponseDto | CheckoutPendingResponseDto> {
    return this.httpClient.request<
      CheckoutCartResponseDto | CheckoutPendingResponseDto
    >({
      serviceName: 'cart-service',
      baseUrl: this.getCartServiceUrl(),
      path: `/api/carts/${cartId}/checkout`,
      method: 'POST',
      headers: {
        ...this.buildUserHeaders(userId),
        'Idempotency-Key': idempotencyKey,
      },
    });
  }

  addCartItem(
    userId: number,
    body: AddCartItemRequestDto,
  ): Promise<CartResponseDto> {
    return this.httpClient.request<CartResponseDto>({
      serviceName: 'cart-service',
      baseUrl: this.getCartServiceUrl(),
      path: '/api/cart-items',
      method: 'POST',
      headers: this.buildUserHeaders(userId),
      body,
    });
  }

  updateCartItem(
    userId: number,
    cartItemId: number,
    body: UpdateCartItemRequestDto,
  ): Promise<CartResponseDto> {
    return this.httpClient.request<CartResponseDto>({
      serviceName: 'cart-service',
      baseUrl: this.getCartServiceUrl(),
      path: `/api/cart-items/${cartItemId}`,
      method: 'PUT',
      headers: this.buildUserHeaders(userId),
      body,
    });
  }

  deleteCartItem(userId: number, cartItemId: number): Promise<CartResponseDto> {
    return this.httpClient.request<CartResponseDto>({
      serviceName: 'cart-service',
      baseUrl: this.getCartServiceUrl(),
      path: `/api/cart-items/${cartItemId}`,
      method: 'DELETE',
      headers: this.buildUserHeaders(userId),
    });
  }

  private buildUserHeaders(userId: number): Record<string, string> {
    return { 'x-user-id': String(userId) };
  }

  private getCartServiceUrl(): string {
    const explicitUrl = this.configService.get<string>('CART_SERVICE_URL');

    if (explicitUrl) {
      return explicitUrl;
    }

    const port = this.configService.get<string>('CART_SERVICE_PORT') ?? '4002';

    return `http://localhost:${port}`;
  }
}
