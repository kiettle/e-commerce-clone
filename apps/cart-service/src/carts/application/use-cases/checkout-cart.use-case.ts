import { CheckoutAttemptEntity } from '../../domain/entities/checkout-attempt.entity';
import { CheckoutStatus } from '../../domain/enums/checkout-status.enum';
import { ReconciliationAction } from '../../domain/enums/reconciliation-action.enum';
import { CheckoutConflictError } from '../../domain/errors/checkout-conflict.error';
import { CheckoutTerminalError } from '../../domain/errors/checkout-terminal.error';
import { InventoryReleaseFailedError } from '../../domain/errors/inventory-release-failed.error';
import { InventoryReservationFailedError } from '../../domain/errors/inventory-reservation-failed.error';
import { InvalidCartOperationError } from '../../domain/errors/invalid-cart-operation.error';
import { OrderCreationFailedError } from '../../domain/errors/order-creation-failed.error';
import { CartRepositoryPort } from '../../domain/repositories/cart.repository.port';
import { CheckoutAttemptRepositoryPort } from '../../domain/repositories/checkout-attempt.repository.port';
import { CheckoutCartCommand } from '../dto/checkout-cart.command';
import { CheckoutCartResult, PendingCheckoutResult } from '../dto/checkout-cart.result';
import { CheckoutFailureLoggerPort } from '../ports/checkout-failure-logger.port';
import { InventoryStockPort, StockOperationItem } from '../ports/inventory-stock.port';
import { OrderCreateItem, OrderCreateResult, OrderCreatorPort } from '../ports/order-creator.port';
import { assertPositiveId } from './get-active-cart.use-case';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CheckoutCartUseCase {
  constructor(
    private readonly carts: CartRepositoryPort,
    private readonly attempts: CheckoutAttemptRepositoryPort,
    private readonly inventory: InventoryStockPort,
    private readonly orders: OrderCreatorPort,
    private readonly checkoutFailureLogger: CheckoutFailureLoggerPort,
  ) {}

  async execute(command: CheckoutCartCommand): Promise<CheckoutCartResult> {
    assertPositiveId(command.userId, 'Cart userId must be greater than zero.');
    assertPositiveId(command.cartId, 'Cart ID must be greater than zero.');
    assertValidIdempotencyKey(command.idempotencyKey);

    let attempt = await this.attempts.findByUserAndKey(command.userId, command.idempotencyKey);

    if (attempt && attempt.cartId !== command.cartId) {
      throw new CheckoutConflictError('This idempotency key belongs to another cart.');
    }

    if (!attempt) {
      attempt = await this.attempts.startOrLoad(
        command.userId,
        command.cartId,
        command.idempotencyKey,
      );
    }

    return this.resume(attempt);
  }

  private async resume(attempt: CheckoutAttemptEntity): Promise<CheckoutCartResult> {
    if (attempt.status === CheckoutStatus.Completed) {
      return this.completedResult(attempt);
    }

    if (attempt.status === CheckoutStatus.Failed) {
      throw new CheckoutTerminalError(attempt.lastError ?? 'Checkout failed.');
    }

    switch (attempt.reconciliationAction) {
      case ReconciliationAction.ReserveStock:
        return this.reserveStock(attempt);
      case ReconciliationAction.CheckOrder:
        return this.checkOrder(attempt);
      case ReconciliationAction.CommitStock:
        return this.commitStock(attempt);
      case ReconciliationAction.CompleteCart:
        return this.completeCart(attempt);
      case ReconciliationAction.ReleaseStock:
        return this.releaseStock(attempt, attempt.lastError ?? 'Checkout failed.');
      default:
        throw new InvalidCartOperationError('Checkout attempt has no recovery action.');
    }
  }

  private async reserveStock(attempt: CheckoutAttemptEntity): Promise<CheckoutCartResult> {
    try {
      await this.inventory.reserveStock(toStockOperation(attempt));
    } catch (error) {
      if (error instanceof InventoryReservationFailedError && error.outcome === 'DEFINITE') {
        await this.attempts.failAndAbandon(attempt.id, error.message);
        throw new CheckoutTerminalError(error.message);
      }

      await this.attempts.markReconciliationRequired(
        attempt.id,
        ReconciliationAction.ReserveStock,
        errorMessage(error),
      );
      return pending(attempt.id);
    }

    const updatedAttempt = await this.attempts.markStockReserved(attempt.id);
    if (
      updatedAttempt.status === CheckoutStatus.StockReserved &&
      updatedAttempt.reconciliationAction === ReconciliationAction.CheckOrder
    ) {
      return this.createOrder(updatedAttempt);
    }

    return this.resume(updatedAttempt);
  }

  private async checkOrder(attempt: CheckoutAttemptEntity): Promise<CheckoutCartResult> {
    let existingOrder: OrderCreateResult;

    try {
      existingOrder = await this.orders.getOrderByCheckoutId(attempt.id);
    } catch (error) {
      if (error instanceof OrderCreationFailedError && error.outcome === 'NOT_FOUND') {
        return this.createOrder(attempt);
      }

      if (error instanceof OrderCreationFailedError && error.outcome === 'DEFINITE') {
        return this.startCompensation(attempt, error.message);
      }

      await this.attempts.markReconciliationRequired(
        attempt.id,
        ReconciliationAction.CheckOrder,
        errorMessage(error),
      );
      return pending(attempt.id);
    }

    const confirmed = await this.attempts.markOrderConfirmed(attempt.id, existingOrder.orderId);
    return this.resume(confirmed);
  }

  private async createOrder(attempt: CheckoutAttemptEntity): Promise<CheckoutCartResult> {
    let order: OrderCreateResult;

    try {
      order = await this.orders.createOrder(attempt.userId, toOrderItems(attempt), {
        checkoutId: attempt.id,
        cartId: attempt.cartId,
        requestHash: attempt.requestHash,
        requestHashVersion: attempt.requestHashVersion,
      });
    } catch (error) {
      if (error instanceof OrderCreationFailedError && error.outcome === 'DEFINITE') {
        return this.startCompensation(attempt, error.message);
      }

      await this.attempts.markReconciliationRequired(
        attempt.id,
        ReconciliationAction.CheckOrder,
        errorMessage(error),
      );
      return pending(attempt.id);
    }

    const confirmed = await this.attempts.markOrderConfirmed(attempt.id, order.orderId);
    return this.resume(confirmed);
  }

  private async startCompensation(
    attempt: CheckoutAttemptEntity,
    failureMessage: string,
  ): Promise<CheckoutCartResult> {
    const updatedAttempt = await this.attempts.markCompensating(attempt.id, failureMessage);

    if (updatedAttempt.reconciliationAction === ReconciliationAction.ReleaseStock) {
      return this.releaseStock(updatedAttempt, failureMessage);
    }

    return this.resume(updatedAttempt);
  }

  private async commitStock(attempt: CheckoutAttemptEntity): Promise<CheckoutCartResult> {
    if (attempt.orderId == null) {
      await this.attempts.markReconciliationRequired(
        attempt.id,
        ReconciliationAction.CommitStock,
        'Checkout attempt is missing its order ID.',
      );
      return pending(attempt.id);
    }

    try {
      await this.inventory.commitStock(toStockOperation(attempt));
    } catch (error) {
      await this.attempts.markReconciliationRequired(
        attempt.id,
        ReconciliationAction.CommitStock,
        errorMessage(error),
      );
      return pending(attempt.id);
    }

    const committed = await this.attempts.markStockCommitted(attempt.id);
    return this.resume(committed);
  }

  private async completeCart(attempt: CheckoutAttemptEntity): Promise<CheckoutCartResult> {
    if (attempt.orderId == null) {
      await this.attempts.markReconciliationRequired(
        attempt.id,
        ReconciliationAction.CompleteCart,
        'Checkout attempt is missing its order ID.',
      );
      return pending(attempt.id);
    }

    try {
      const cart = await this.attempts.complete(attempt.id, attempt.orderId);
      return {
        outcome: 'COMPLETED',
        checkoutId: attempt.id,
        status: 'COMPLETED',
        cart,
        orderId: attempt.orderId,
      };
    } catch (error) {
      await this.attempts.markReconciliationRequired(
        attempt.id,
        ReconciliationAction.CompleteCart,
        errorMessage(error),
      );
      return pending(attempt.id);
    }
  }

  private async releaseStock(
    attempt: CheckoutAttemptEntity,
    failureMessage: string,
  ): Promise<CheckoutCartResult> {
    try {
      await this.inventory.releaseStock(toStockOperation(attempt));
    } catch (error) {
      this.checkoutFailureLogger.logInventoryReleaseFailure(attempt.cartId, error);
      const releaseError =
        error instanceof InventoryReleaseFailedError ? error.message : errorMessage(error);
      await this.attempts.markReconciliationRequired(
        attempt.id,
        ReconciliationAction.ReleaseStock,
        `${failureMessage} Release failed: ${releaseError}`,
      );
      return pending(attempt.id);
    }

    await this.attempts.failAndAbandon(attempt.id, failureMessage);
    throw new CheckoutTerminalError(failureMessage);
  }

  private async completedResult(attempt: CheckoutAttemptEntity): Promise<CheckoutCartResult> {
    if (attempt.orderId == null) {
      throw new InvalidCartOperationError('Completed checkout is missing its order ID.');
    }

    const cart = await this.carts.findById(attempt.cartId);

    if (!cart) {
      throw new InvalidCartOperationError('Completed checkout cart was not found.');
    }

    return {
      outcome: 'COMPLETED',
      checkoutId: attempt.id,
      status: 'COMPLETED',
      cart,
      orderId: attempt.orderId,
    };
  }
}

function assertValidIdempotencyKey(idempotencyKey: string): void {
  if (!UUID_V4_PATTERN.test(idempotencyKey)) {
    throw new InvalidCartOperationError('Idempotency-Key must be a valid UUID v4.');
  }
}

function toStockItems(attempt: CheckoutAttemptEntity): StockOperationItem[] {
  return attempt.itemsSnapshot.map((item) => ({
    productSkuId: BigInt(item.productSkuId),
    quantity: item.quantity,
    flashSaleId: item.flashSaleId == null ? null : BigInt(item.flashSaleId),
    flashSaleItemId: item.flashSaleItemId == null ? null : BigInt(item.flashSaleItemId),
  }));
}

function toStockOperation(attempt: CheckoutAttemptEntity) {
  return {
    cartId: attempt.cartId,
    checkoutId: attempt.id,
    userId: attempt.userId,
    items: toStockItems(attempt),
  };
}

function toOrderItems(attempt: CheckoutAttemptEntity): OrderCreateItem[] {
  return attempt.itemsSnapshot.map((item) => ({
    productSkuId: BigInt(item.productSkuId),
    productName: item.productName,
    skuCode: item.skuCode,
    imageUrl: item.imageUrl,
    price: Number(item.price),
    quantity: item.quantity,
    ...(attempt.requestHashVersion === 2
      ? {
          regularPrice: Number(item.regularPrice),
          priceSource: item.priceSource,
          flashSaleId: item.flashSaleId == null ? null : BigInt(item.flashSaleId),
          flashSaleItemId: item.flashSaleItemId == null ? null : BigInt(item.flashSaleItemId),
          saleEndsAt: item.saleEndsAt ?? null,
        }
      : {}),
  }));
}

function pending(checkoutId: string): PendingCheckoutResult {
  return {
    outcome: 'PENDING',
    checkoutId,
    status: 'RECONCILIATION_REQUIRED',
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown checkout failure.';
}
