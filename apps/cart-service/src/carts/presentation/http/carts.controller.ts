import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Res,
} from '@nestjs/common';
import { CheckoutCartUseCase } from '../../application/use-cases/checkout-cart.use-case';
import { GetActiveCartUseCase } from '../../application/use-cases/get-active-cart.use-case';
import { CartNotFoundError } from '../../domain/errors/cart-not-found.error';
import { CheckoutConflictError } from '../../domain/errors/checkout-conflict.error';
import { CheckoutNotFoundError } from '../../domain/errors/checkout-not-found.error';
import { CheckoutTerminalError } from '../../domain/errors/checkout-terminal.error';
import { CartOperationError } from '../../domain/errors/cart-operation.error';
import { CartItemNotFoundError } from '../../domain/errors/cart-item-not-found.error';
import { CartItemPricingChangedError } from '../../domain/errors/cart-item-pricing-changed.error';
import { InventoryReservationFailedError } from '../../domain/errors/inventory-reservation-failed.error';
import { InvalidCartOperationError } from '../../domain/errors/invalid-cart-operation.error';
import { OrderCreationFailedError } from '../../domain/errors/order-creation-failed.error';
import { ProductSnapshotNotFoundError } from '../../domain/errors/product-snapshot-not-found.error';
import { ProductSnapshotUnavailableError } from '../../domain/errors/product-snapshot-unavailable.error';
import {
  CartResponse,
  CheckoutCartResponse,
  CheckoutPendingResponse,
  toCartResponse,
} from './cart-response.mapper';
import { parseUserIdHeader } from './user-id-header';

@Controller('api/carts')
export class CartsController {
  constructor(
    private readonly getActiveCartUseCase: GetActiveCartUseCase,
    private readonly checkoutCartUseCase: CheckoutCartUseCase,
  ) {}

  @Get('me')
  async getActiveCart(
    @Headers('x-user-id') userIdHeader: string | undefined,
  ): Promise<CartResponse> {
    const cart = await this.getActiveCartUseCase.execute(parseUserIdHeader(userIdHeader));

    return toCartResponse(cart);
  }

  @Post(':cartId/checkout')
  @HttpCode(HttpStatus.OK)
  async checkoutCart(
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('cartId', ParseIntPipe) cartId: number,
    @Res({ passthrough: true }) response: { status(code: number): unknown },
  ): Promise<CheckoutCartResponse | CheckoutPendingResponse> {
    try {
      const result = await this.checkoutCartUseCase.execute({
        userId: parseUserIdHeader(userIdHeader),
        cartId: BigInt(cartId),
        idempotencyKey: idempotencyKey ?? '',
      });

      if (result.outcome === 'PENDING') {
        response.status(202);
        return {
          checkoutId: result.checkoutId,
          status: result.status,
        };
      }

      return {
        checkoutId: result.checkoutId,
        status: result.status,
        orderId: Number(result.orderId),
        cart: toCartResponse(result.cart),
      };
    } catch (error) {
      throw mapCartError(error);
    }
  }
}

export function mapCartError(error: unknown): Error {
  if (
    error instanceof CartNotFoundError ||
    error instanceof CartItemNotFoundError ||
    error instanceof CheckoutNotFoundError ||
    error instanceof ProductSnapshotNotFoundError
  ) {
    return new NotFoundException(error.message);
  }

  if (error instanceof CheckoutConflictError) {
    return new ConflictException(error.message);
  }

  if (error instanceof CartItemPricingChangedError) {
    return new ConflictException({ code: error.code, message: error.message });
  }

  if (error instanceof CheckoutTerminalError) {
    return new BadRequestException(error.message);
  }

  if (
    error instanceof InvalidCartOperationError ||
    error instanceof InventoryReservationFailedError
  ) {
    return new BadRequestException(error.message);
  }

  if (
    error instanceof OrderCreationFailedError ||
    error instanceof ProductSnapshotUnavailableError
  ) {
    return new BadGatewayException(error.message);
  }

  if (error instanceof CartOperationError) {
    return new BadRequestException(error.message);
  }

  return error instanceof Error ? error : new Error('Unknown cart error.');
}
