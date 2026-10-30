import { status as GrpcStatus } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { CartNotFoundError } from '../../domain/errors/cart-not-found.error';
import { CheckoutConflictError } from '../../domain/errors/checkout-conflict.error';
import { CheckoutNotFoundError } from '../../domain/errors/checkout-not-found.error';
import { CheckoutTerminalError } from '../../domain/errors/checkout-terminal.error';
import { CartOperationError } from '../../domain/errors/cart-operation.error';
import { CartItemNotFoundError } from '../../domain/errors/cart-item-not-found.error';
import { CartItemPricingChangedError } from '../../domain/errors/cart-item-pricing-changed.error';
import { FlashSaleQuantityExceededError } from '../../domain/errors/flash-sale-quantity-exceeded.error';
import { InventoryReservationFailedError } from '../../domain/errors/inventory-reservation-failed.error';
import { InvalidCartOperationError } from '../../domain/errors/invalid-cart-operation.error';
import { OrderCreationFailedError } from '../../domain/errors/order-creation-failed.error';
import { ProductSnapshotNotFoundError } from '../../domain/errors/product-snapshot-not-found.error';
import { ProductSnapshotUnavailableError } from '../../domain/errors/product-snapshot-unavailable.error';
export function mapCartError(error: unknown): RpcException {
  if (error instanceof RpcException) return error;
  if (
    error instanceof CartNotFoundError ||
    error instanceof CartItemNotFoundError ||
    error instanceof CheckoutNotFoundError ||
    error instanceof ProductSnapshotNotFoundError
  ) {
    return rpcError(GrpcStatus.NOT_FOUND, error.message);
  }

  if (error instanceof CheckoutConflictError) {
    return rpcError(GrpcStatus.FAILED_PRECONDITION, error.message);
  }

  if (error instanceof CartItemPricingChangedError) {
    return rpcError(GrpcStatus.FAILED_PRECONDITION, { code: error.code, message: error.message });
  }

  if (error instanceof FlashSaleQuantityExceededError) {
    return rpcError(GrpcStatus.FAILED_PRECONDITION, { code: error.code, message: error.message });
  }

  if (error instanceof CheckoutTerminalError) {
    if (error.code) {
      return rpcError(GrpcStatus.FAILED_PRECONDITION, { code: error.code, message: error.message });
    }
    return rpcError(GrpcStatus.INVALID_ARGUMENT, error.message);
  }

  if (
    error instanceof InvalidCartOperationError ||
    error instanceof InventoryReservationFailedError
  ) {
    return rpcError(GrpcStatus.INVALID_ARGUMENT, error.message);
  }

  if (
    error instanceof OrderCreationFailedError ||
    error instanceof ProductSnapshotUnavailableError
  ) {
    return rpcError(GrpcStatus.UNAVAILABLE, error.message);
  }

  if (error instanceof CartOperationError) {
    return rpcError(GrpcStatus.INVALID_ARGUMENT, error.message);
  }

  return rpcError(GrpcStatus.INTERNAL, 'Internal server error');
}

function rpcError(
  code: GrpcStatus,
  body: string | { code: string; message: string },
): RpcException {
  return new RpcException({
    code,
    message: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
