import { Injectable } from '@nestjs/common';
import {
  CheckoutAttempt as PrismaCheckoutAttempt,
  Prisma,
} from '../../../../../../../prisma/generated/cart';
import {
  hashCheckoutRequest,
  serializeCheckoutRequest,
} from '../../../application/services/checkout-request-hash';
import { CartEntity } from '../../../domain/entities/cart.entity';
import {
  CheckoutAttemptEntity,
  CheckoutItemSnapshot,
} from '../../../domain/entities/checkout-attempt.entity';
import { CartStatus } from '../../../domain/enums/cart-status.enum';
import { CartItemPriceSource } from '../../../domain/enums/cart-item-price-source.enum';
import { CheckoutStatus } from '../../../domain/enums/checkout-status.enum';
import { ReconciliationAction } from '../../../domain/enums/reconciliation-action.enum';
import { CartNotFoundError } from '../../../domain/errors/cart-not-found.error';
import { CheckoutConflictError } from '../../../domain/errors/checkout-conflict.error';
import { InvalidCartOperationError } from '../../../domain/errors/invalid-cart-operation.error';
import { CheckoutAttemptRepositoryPort } from '../../../domain/repositories/checkout-attempt.repository.port';
import { PrismaCartRepository } from './cart.prisma.repository';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaCheckoutAttemptRepository implements CheckoutAttemptRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(checkoutId: string): Promise<CheckoutAttemptEntity | null> {
    const attempt = await this.prisma.checkoutAttempt.findUnique({
      where: { id: checkoutId },
    });

    return attempt ? toDomain(attempt) : null;
  }

  async findByUserAndKey(
    userId: bigint,
    idempotencyKey: string,
  ): Promise<CheckoutAttemptEntity | null> {
    const attempt = await this.prisma.checkoutAttempt.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
    });

    return attempt ? toDomain(attempt) : null;
  }

  async startOrLoad(
    userId: bigint,
    cartId: bigint,
    idempotencyKey: string,
  ): Promise<CheckoutAttemptEntity> {
    try {
      const attempt = await this.prisma.$transaction(async (transaction) => {
        await lockCart(transaction, cartId);

        const cart = await transaction.cart.findUnique({
          where: { id: cartId },
          include: { items: { orderBy: { id: 'asc' } } },
        });

        if (!cart || cart.userId !== userId) {
          throw new CartNotFoundError(cartId);
        }

        const existingAttempt = await transaction.checkoutAttempt.findUnique({
          where: { cartId },
        });

        if (existingAttempt) {
          if (
            existingAttempt.userId === userId &&
            existingAttempt.idempotencyKey === idempotencyKey
          ) {
            return existingAttempt;
          }

          throw new CheckoutConflictError(
            'This cart already has a checkout attempt with another key.',
          );
        }

        if (cart.status !== CartStatus.Active) {
          throw new InvalidCartOperationError('Only active carts can be checked out.');
        }

        if (cart.items.length === 0) {
          throw new InvalidCartOperationError('Cart must contain at least one item.');
        }

        const [{ now }] = await transaction.$queryRaw<Array<{ now: Date }>>`
          SELECT clock_timestamp() AS "now"
        `;
        if (
          cart.items.some(
            (item) =>
              item.priceSource === CartItemPriceSource.FlashSale &&
              (item.saleEndsAt == null || item.saleEndsAt <= now),
          )
        ) {
          throw new InvalidCartOperationError(
            'Flash-sale pricing expired. Remove the item and add it again.',
          );
        }

        const hashInput = {
          userId,
          cartId,
          items: cart.items.map((item) => ({
            productSkuId: item.productSkuId,
            productName: item.productName,
            skuCode: item.skuCode,
            imageUrl: item.imageUrl,
            price: Number(item.price),
            quantity: item.quantity,
          })),
        };
        const canonical = JSON.parse(serializeCheckoutRequest(hashInput)) as {
          items: CheckoutItemSnapshot[];
        };
        const cartItemBySkuId = new Map(
          cart.items.map((item) => [item.productSkuId.toString(), item]),
        );
        const itemsSnapshot = canonical.items.map((item) => {
          const cartItem = cartItemBySkuId.get(item.productSkuId);
          return {
            ...item,
            flashSaleId: cartItem?.flashSaleId?.toString() ?? null,
            flashSaleItemId: cartItem?.flashSaleItemId?.toString() ?? null,
          };
        });

        return transaction.checkoutAttempt.create({
          data: {
            userId,
            cartId,
            idempotencyKey,
            requestHash: hashCheckoutRequest(hashInput),
            itemsSnapshot: itemsSnapshot as unknown as Prisma.InputJsonValue,
            status: CheckoutStatus.Started,
            reconciliationAction: ReconciliationAction.ReserveStock,
          },
        });
      });

      return toDomain(attempt);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const sameKey = await this.findByUserAndKey(userId, idempotencyKey);

      if (sameKey) {
        if (sameKey.cartId !== cartId) {
          throw new CheckoutConflictError('This idempotency key belongs to another cart.');
        }

        return sameKey;
      }

      const cartAttempt = await this.prisma.checkoutAttempt.findUnique({
        where: { cartId },
      });

      if (cartAttempt) {
        throw new CheckoutConflictError(
          'This cart already has a checkout attempt with another key.',
        );
      }

      throw error;
    }
  }

  async markStockReserved(attemptId: string): Promise<CheckoutAttemptEntity> {
    return this.transition(attemptId, ReconciliationAction.ReserveStock, {
      status: CheckoutStatus.StockReserved,
      reconciliationAction: ReconciliationAction.CheckOrder,
      lastError: null,
      nextRetryAt: null,
    });
  }

  async markOrderConfirmed(attemptId: string, orderId: bigint): Promise<CheckoutAttemptEntity> {
    return this.transition(attemptId, ReconciliationAction.CheckOrder, {
      status: CheckoutStatus.OrderConfirmed,
      orderId,
      reconciliationAction: ReconciliationAction.CommitStock,
      lastError: null,
      nextRetryAt: null,
    });
  }

  async markStockCommitted(attemptId: string): Promise<CheckoutAttemptEntity> {
    return this.transition(attemptId, ReconciliationAction.CommitStock, {
      status: CheckoutStatus.StockCommitted,
      reconciliationAction: ReconciliationAction.CompleteCart,
      lastError: null,
      nextRetryAt: null,
    });
  }

  async markCompensating(attemptId: string, error: string): Promise<CheckoutAttemptEntity> {
    return this.transition(attemptId, ReconciliationAction.CheckOrder, {
      status: CheckoutStatus.Compensating,
      reconciliationAction: ReconciliationAction.ReleaseStock,
      lastError: error,
      nextRetryAt: null,
    });
  }

  async markReconciliationRequired(
    attemptId: string,
    action: ReconciliationAction,
    error: string,
  ): Promise<void> {
    await this.prisma.checkoutAttempt.updateMany({
      where: {
        id: attemptId,
        reconciliationAction: action,
        status: {
          notIn: [CheckoutStatus.Completed, CheckoutStatus.Failed],
        },
      },
      data: {
        status: CheckoutStatus.ReconciliationRequired,
        lastError: error,
        retryCount: { increment: 1 },
        nextRetryAt: new Date(),
      },
    });
  }

  async complete(attemptId: string, orderId: bigint): Promise<CartEntity> {
    const cart = await this.prisma.$transaction(async (transaction) => {
      await lockAttempt(transaction, attemptId);
      const attempt = await transaction.checkoutAttempt.findUniqueOrThrow({
        where: { id: attemptId },
      });

      if (attempt.status === CheckoutStatus.Completed) {
        return transaction.cart.findUniqueOrThrow({
          where: { id: attempt.cartId },
          include: { items: { orderBy: { id: 'asc' } } },
        });
      }

      if (
        attempt.reconciliationAction !== ReconciliationAction.CompleteCart ||
        attempt.orderId !== orderId
      ) {
        throw new InvalidCartOperationError('Checkout attempt is not ready to complete the cart.');
      }

      const updatedCart = await transaction.cart.update({
        where: { id: attempt.cartId },
        data: { status: CartStatus.CheckedOut },
        include: { items: { orderBy: { id: 'asc' } } },
      });

      await transaction.checkoutAttempt.update({
        where: { id: attemptId },
        data: {
          status: CheckoutStatus.Completed,
          orderId,
          reconciliationAction: null,
          lastError: null,
          nextRetryAt: null,
        },
      });

      return updatedCart;
    });

    return PrismaCartRepository.toDomain(cart);
  }

  async failAndAbandon(attemptId: string, error: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await lockAttempt(transaction, attemptId);
      const attempt = await transaction.checkoutAttempt.findUniqueOrThrow({
        where: { id: attemptId },
      });

      if (attempt.status === CheckoutStatus.Failed) {
        return;
      }

      if (
        attempt.reconciliationAction !== ReconciliationAction.ReleaseStock &&
        attempt.reconciliationAction !== ReconciliationAction.ReserveStock
      ) {
        throw new InvalidCartOperationError('Checkout attempt is not ready to fail.');
      }

      await transaction.cart.update({
        where: { id: attempt.cartId },
        data: { status: CartStatus.Abandoned },
      });
      await transaction.checkoutAttempt.update({
        where: { id: attemptId },
        data: {
          status: CheckoutStatus.Failed,
          reconciliationAction: null,
          lastError: error,
          nextRetryAt: null,
        },
      });
    });
  }

  private async transition(
    attemptId: string,
    expectedAction: ReconciliationAction,
    data: Prisma.CheckoutAttemptUpdateInput,
  ): Promise<CheckoutAttemptEntity> {
    await this.prisma.checkoutAttempt.updateMany({
      where: {
        id: attemptId,
        reconciliationAction: expectedAction,
        status: {
          notIn: [CheckoutStatus.Completed, CheckoutStatus.Failed],
        },
      },
      data,
    });
    const attempt = await this.prisma.checkoutAttempt.findUniqueOrThrow({
      where: { id: attemptId },
    });

    return toDomain(attempt);
  }
}

async function lockCart(transaction: Prisma.TransactionClient, cartId: bigint): Promise<void> {
  await transaction.$queryRaw`
    SELECT "id" FROM "carts" WHERE "id" = ${cartId} FOR UPDATE
  `;
}

async function lockAttempt(
  transaction: Prisma.TransactionClient,
  attemptId: string,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT "id" FROM "checkout_attempts" WHERE "id" = ${attemptId}::uuid FOR UPDATE
  `;
}

function toDomain(attempt: PrismaCheckoutAttempt): CheckoutAttemptEntity {
  return new CheckoutAttemptEntity({
    id: attempt.id,
    userId: attempt.userId,
    cartId: attempt.cartId,
    idempotencyKey: attempt.idempotencyKey,
    requestHash: attempt.requestHash,
    itemsSnapshot: attempt.itemsSnapshot as unknown as CheckoutItemSnapshot[],
    status: attempt.status as CheckoutStatus,
    orderId: attempt.orderId,
    retryCount: attempt.retryCount,
    lastError: attempt.lastError,
    reconciliationAction: attempt.reconciliationAction as ReconciliationAction | null,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
