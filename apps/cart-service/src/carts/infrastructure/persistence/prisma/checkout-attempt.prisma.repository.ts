import { Injectable } from '@nestjs/common';
import {
  CheckoutAttempt as PrismaCheckoutAttempt,
  Prisma,
} from '../../../../../../../prisma/generated/cart';
import {
  CURRENT_CHECKOUT_HASH_VERSION,
  hashCheckoutRequest,
  serializeCheckoutRequest,
} from '../../../application/services/checkout-request-hash';
import { CartEntity } from '../../../domain/entities/cart.entity';
import {
  CheckoutAttemptEntity,
  CheckoutItemSnapshot,
} from '../../../domain/entities/checkout-attempt.entity';
import { CartStatus } from '../../../domain/enums/cart-status.enum';
import { CheckoutStatus } from '../../../domain/enums/checkout-status.enum';
import { ReconciliationAction } from '../../../domain/enums/reconciliation-action.enum';
import { CartNotFoundError } from '../../../domain/errors/cart-not-found.error';
import { CheckoutConflictError } from '../../../domain/errors/checkout-conflict.error';
import { InvalidCartOperationError } from '../../../domain/errors/invalid-cart-operation.error';
import { CheckoutAttemptRepositoryPort } from '../../../domain/repositories/checkout-attempt.repository.port';
import { PrismaCartRepository } from './cart.prisma.repository';
import { PrismaService } from './prisma.service';

interface ClaimedCheckoutAttemptRow {
  id: string;
  user_id: bigint;
  cart_id: bigint;
  idempotency_key: string;
  request_hash: string;
  request_hash_version: number;
  items_snapshot: Prisma.JsonValue;
  status: string;
  order_id: bigint | null;
  retry_count: number;
  next_retry_at: Date | null;
  last_error: string | null;
  reconciliation_action: string | null;
  lease_owner: string | null;
  lease_until: Date | null;
  created_at: Date;
  updated_at: Date;
}

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

  async claimDue(request: {
    limit: number;
    leaseOwner: string;
    leaseUntil: Date;
    maxAttempts: number;
    now: Date;
  }): Promise<CheckoutAttemptEntity[]> {
    validateClaimRequest(request);

    const rows = await this.prisma.$transaction((transaction) =>
      transaction.$queryRaw<ClaimedCheckoutAttemptRow[]>(Prisma.sql`
        WITH claimable AS MATERIALIZED (
          SELECT "id"
          FROM "checkout_attempts"
          WHERE "status" NOT IN (
              'COMPLETED'::"CheckoutStatus",
              'FAILED'::"CheckoutStatus"
            )
            AND "reconciliation_action" IS NOT NULL
            AND "retry_count" < ${request.maxAttempts}
            AND ("next_retry_at" IS NULL OR "next_retry_at" <= ${request.now})
            AND ("lease_until" IS NULL OR "lease_until" <= ${request.now})
          ORDER BY COALESCE("next_retry_at", "created_at") ASC, "created_at" ASC, "id" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${request.limit}
        ), claimed AS (
          UPDATE "checkout_attempts" AS attempt
          SET
            "lease_owner" = ${request.leaseOwner},
            "lease_until" = ${request.leaseUntil},
            "updated_at" = ${request.now}
          FROM claimable
          WHERE attempt."id" = claimable."id"
          RETURNING attempt.*
        )
        SELECT *
        FROM claimed
        ORDER BY COALESCE("next_retry_at", "created_at") ASC, "created_at" ASC, "id" ASC
      `),
    );

    return rows.map(toDomainFromRaw);
  }

  async finishClaim(
    attemptId: string,
    leaseOwner: string,
    nextRetryAt: Date | null,
  ): Promise<boolean> {
    const result = await this.prisma.checkoutAttempt.updateMany({
      where: { id: attemptId, leaseOwner },
      data: {
        nextRetryAt,
        leaseOwner: null,
        leaseUntil: null,
      },
    });

    return result.count === 1;
  }

  async markClaimFailed(
    attemptId: string,
    leaseOwner: string,
    error: string,
    nextRetryAt: Date | null,
  ): Promise<boolean> {
    const result = await this.prisma.checkoutAttempt.updateMany({
      where: {
        id: attemptId,
        leaseOwner,
        status: { notIn: [CheckoutStatus.Completed, CheckoutStatus.Failed] },
      },
      data: {
        status: CheckoutStatus.ReconciliationRequired,
        retryCount: { increment: 1 },
        nextRetryAt,
        lastError: sanitizeError(error),
        leaseOwner: null,
        leaseUntil: null,
      },
    });

    return result.count === 1;
  }

  async startOrLoad(
    userId: bigint,
    cartId: bigint,
    idempotencyKey: string,
  ): Promise<CheckoutAttemptEntity> {
    try {
      const attempt = await this.prisma.$transaction(async (transaction) => {
        await lockCart(transaction, cartId);

        const existingKeyAttempt = await transaction.checkoutAttempt.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
        });
        if (existingKeyAttempt) {
          if (existingKeyAttempt.cartId !== cartId) {
            throw new CheckoutConflictError('This idempotency key belongs to another cart.');
          }

          return existingKeyAttempt;
        }

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
            priceSource: item.priceSource,
            regularPrice: Number(item.regularPrice),
            flashSaleId: item.flashSaleId,
            flashSaleItemId: item.flashSaleItemId,
            saleEndsAt: item.saleEndsAt,
          })),
        };
        const canonical = JSON.parse(
          serializeCheckoutRequest(hashInput, CURRENT_CHECKOUT_HASH_VERSION),
        ) as {
          items: CheckoutItemSnapshot[];
        };

        return transaction.checkoutAttempt.create({
          data: {
            userId,
            cartId,
            idempotencyKey,
            requestHash: hashCheckoutRequest(hashInput, CURRENT_CHECKOUT_HASH_VERSION),
            requestHashVersion: CURRENT_CHECKOUT_HASH_VERSION,
            itemsSnapshot: canonical.items as unknown as Prisma.InputJsonValue,
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
          leaseOwner: null,
          leaseUntil: null,
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
          leaseOwner: null,
          leaseUntil: null,
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
    requestHashVersion: attempt.requestHashVersion,
    itemsSnapshot: attempt.itemsSnapshot as unknown as CheckoutItemSnapshot[],
    status: attempt.status as CheckoutStatus,
    orderId: attempt.orderId,
    retryCount: attempt.retryCount,
    nextRetryAt: attempt.nextRetryAt,
    lastError: attempt.lastError,
    reconciliationAction: attempt.reconciliationAction as ReconciliationAction | null,
    leaseOwner: attempt.leaseOwner,
    leaseUntil: attempt.leaseUntil,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
  });
}

function toDomainFromRaw(attempt: ClaimedCheckoutAttemptRow): CheckoutAttemptEntity {
  return new CheckoutAttemptEntity({
    id: attempt.id,
    userId: attempt.user_id,
    cartId: attempt.cart_id,
    idempotencyKey: attempt.idempotency_key,
    requestHash: attempt.request_hash,
    requestHashVersion: attempt.request_hash_version,
    itemsSnapshot: attempt.items_snapshot as unknown as CheckoutItemSnapshot[],
    status: attempt.status as CheckoutStatus,
    orderId: attempt.order_id,
    retryCount: attempt.retry_count,
    nextRetryAt: attempt.next_retry_at,
    lastError: attempt.last_error,
    reconciliationAction: attempt.reconciliation_action as ReconciliationAction | null,
    leaseOwner: attempt.lease_owner,
    leaseUntil: attempt.lease_until,
    createdAt: attempt.created_at,
    updatedAt: attempt.updated_at,
  });
}

function validateClaimRequest(request: {
  limit: number;
  leaseOwner: string;
  leaseUntil: Date;
  maxAttempts: number;
  now: Date;
}): void {
  if (!Number.isInteger(request.limit) || request.limit <= 0) {
    throw new Error('Checkout claim limit must be a positive integer.');
  }
  if (!Number.isInteger(request.maxAttempts) || request.maxAttempts <= 0) {
    throw new Error('Checkout maximum attempts must be a positive integer.');
  }
  if (!request.leaseOwner.trim()) {
    throw new Error('Checkout lease owner must not be empty.');
  }
  if (
    Number.isNaN(request.now.getTime()) ||
    Number.isNaN(request.leaseUntil.getTime()) ||
    request.leaseUntil <= request.now
  ) {
    throw new Error('Checkout lease must end after the claim time.');
  }
}

function sanitizeError(error: string): string {
  const sanitized = error.replaceAll('\0', '').replace(/\s+/g, ' ').trim();
  return (sanitized || 'Checkout recovery failed.').slice(0, 1_000);
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
