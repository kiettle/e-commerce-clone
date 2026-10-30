import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { AddCartItemUseCase } from '../../application/use-cases/add-cart-item.use-case';
import { CheckoutCartUseCase } from '../../application/use-cases/checkout-cart.use-case';
import { DeleteCartItemUseCase } from '../../application/use-cases/delete-cart-item.use-case';
import { GetActiveCartUseCase } from '../../application/use-cases/get-active-cart.use-case';
import { GetCheckoutStatusUseCase } from '../../application/use-cases/get-checkout-status.use-case';
import { UpdateCartItemUseCase } from '../../application/use-cases/update-cart-item.use-case';
import type {
  UserRequest,
  AddCartItemRequest,
  CartItemRequest,
  UpdateCartItemRequest,
  CheckoutCartRequest,
  CheckoutStatusRequest,
  CheckoutCartResponse,
} from '../../../../../../libs/proto/cart.types';
import { mapCartError } from './cart-grpc-error.mapper';
import { toCartResponse, toCheckoutStatusResponse } from './cart-grpc-response.mapper';

@Controller()
export class CartsGrpcController {
  constructor(
    private readonly active: GetActiveCartUseCase,
    private readonly add: AddCartItemUseCase,
    private readonly update: UpdateCartItemUseCase,
    private readonly remove: DeleteCartItemUseCase,
    private readonly checkout: CheckoutCartUseCase,
    private readonly checkoutStatus: GetCheckoutStatusUseCase,
  ) {}

  @GrpcMethod('CartService', 'GetActiveCart')
  getActiveCart(request: UserRequest) {
    return rpc(async () => toCartResponse(await this.active.execute(userId(request.user_id))));
  }

  @GrpcMethod('CartService', 'AddCartItem')
  addCartItem(request: AddCartItemRequest) {
    return rpc(async () =>
      toCartResponse(
        await this.add.execute({
          userId: userId(request.user_id),
          productSkuId: positiveId(request.product_sku_id),
          quantity: quantity(request.quantity, 1),
        }),
      ),
    );
  }

  @GrpcMethod('CartService', 'UpdateCartItem')
  updateCartItem(request: UpdateCartItemRequest) {
    return rpc(async () =>
      toCartResponse(
        await this.update.execute({
          userId: userId(request.user_id),
          cartItemId: positiveId(request.cart_item_id),
          quantity: quantity(request.quantity, 0),
        }),
      ),
    );
  }

  @GrpcMethod('CartService', 'DeleteCartItem')
  deleteCartItem(request: CartItemRequest) {
    return rpc(async () =>
      toCartResponse(
        await this.remove.execute({
          userId: userId(request.user_id),
          cartItemId: positiveId(request.cart_item_id),
        }),
      ),
    );
  }

  @GrpcMethod('CartService', 'CheckoutCart')
  checkoutCart(request: CheckoutCartRequest): Promise<CheckoutCartResponse> {
    return rpc(async () => {
      const result = await this.checkout.execute({
        userId: userId(request.user_id),
        cartId: positiveId(request.cart_id),
        idempotencyKey: request.idempotency_key ?? '',
      });
      return result.outcome === 'PENDING'
        ? { pending: { checkout_id: result.checkoutId } }
        : {
            completed: {
              checkout_id: result.checkoutId,
              order_id: String(result.orderId),
              cart: toCartResponse(result.cart),
            },
          };
    });
  }

  @GrpcMethod('CartService', 'GetCheckoutStatus')
  getCheckoutStatus(request: CheckoutStatusRequest) {
    return rpc(async () =>
      toCheckoutStatusResponse(
        await this.checkoutStatus.execute(userId(request.user_id), request.checkout_id ?? ''),
      ),
    );
  }
}

async function rpc<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapCartError(error);
  }
}
function positiveId(value: string): bigint {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value) ||
    BigInt(value) > 9223372036854775807n
  ) {
    throw new RpcException({
      code: status.INVALID_ARGUMENT,
      message: 'Identifier must be a positive int64.',
    });
  }
  return BigInt(value);
}
function userId(value: string): bigint {
  try {
    return positiveId(value);
  } catch {
    throw new RpcException({
      code: status.UNAUTHENTICATED,
      message: 'Missing or invalid user identity.',
    });
  }
}
function quantity(value: number | undefined, minimum: number): number {
  if (value === undefined || !Number.isInteger(value) || value < minimum || value > 2147483647) {
    throw new RpcException({
      code: status.INVALID_ARGUMENT,
      message: `Quantity must be an integer between ${minimum} and 2147483647.`,
    });
  }
  return value;
}
