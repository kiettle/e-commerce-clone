import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { describe, it, expect, vi } from 'vitest';
import { PrismaService } from '../../apps/cart-service/src/carts/infrastructure/persistence/prisma/prisma.service';
import { ProductGrpcCatalogClient } from '../../apps/cart-service/src/carts/infrastructure/grpc/product-grpc-catalog.client';
import { CheckoutReconciliationWorker } from '../../apps/cart-service/src/carts/infrastructure/workers/checkout-reconciliation.worker';
import { CheckoutCartUseCase } from '../../apps/cart-service/src/carts/application/use-cases/checkout-cart.use-case';
import { CheckoutAttemptRepositoryPort } from '../../apps/cart-service/src/carts/domain/repositories/checkout-attempt.repository.port';
import { CheckoutAttemptEntity } from '../../apps/cart-service/src/carts/domain/entities/checkout-attempt.entity';
import { CheckoutStatus } from '../../apps/cart-service/src/carts/domain/enums/checkout-status.enum';
import { ReconciliationAction } from '../../apps/cart-service/src/carts/domain/enums/reconciliation-action.enum';

describe('cart shutdown ordering', () => {
  it.each(['resume', 'claim failure'])(
    'drains the worker before resource cleanup: %s',
    async (mode) => {
      let finish!: () => void;
      const running = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const config = new ConfigService({
        CART_DATABASE_URL: process.env.CART_INTEGRATION_DATABASE_URL,
        CHECKOUT_RECONCILIATION_SHUTDOWN_TIMEOUT_MS: 1000,
      });
      const prisma = new PrismaService(config);
      const disconnect = vi.spyOn(prisma, '$disconnect').mockResolvedValue(undefined);
      const close = vi.fn();
      class Client extends ProductGrpcCatalogClient {
        protected createClient() {
          return { getService: () => ({}), close } as any;
        }
      }
      const client = new Client(config);
      const attempt = new CheckoutAttemptEntity({
        id: '550e8400-e29b-41d4-a716-446655440000',
        userId: 10n,
        cartId: 20n,
        idempotencyKey: 'key',
        requestHash: 'a'.repeat(64),
        itemsSnapshot: [],
        status: CheckoutStatus.ReconciliationRequired,
        reconciliationAction: ReconciliationAction.CheckOrder,
        leaseOwner: 'worker',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const attempts = {
        claimDue: vi.fn(async () => {
          if (mode === 'claim failure') {
            await running;
            throw new Error('Claim failed during shutdown.');
          }
          return [attempt];
        }),
        finishClaim: vi.fn().mockResolvedValue(true),
      } as unknown as CheckoutAttemptRepositoryPort;
      const resumeAttempt = vi.fn(async () => {
        await running;
        return { outcome: 'PENDING', checkoutId: attempt.id, status: 'RECONCILIATION_REQUIRED' };
      });
      const worker = new CheckoutReconciliationWorker(
        attempts,
        { resumeAttempt } as unknown as CheckoutCartUseCase,
        config,
      );
      @Module({
        providers: [
          { provide: PrismaService, useValue: prisma },
          { provide: ProductGrpcCatalogClient, useValue: client },
          { provide: CheckoutReconciliationWorker, useValue: worker },
        ],
      })
      class ShutdownModule {}
      const app = await NestFactory.createApplicationContext(ShutdownModule, { logger: false });
      let closing: Promise<void> | undefined;
      try {
        await vi.waitFor(() =>
          expect(mode === 'resume' ? resumeAttempt : attempts.claimDue).toHaveBeenCalledOnce(),
        );
        closing = app.close();
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(disconnect).not.toHaveBeenCalled();
        expect(close).not.toHaveBeenCalled();
        finish();
        await closing;
        if (mode === 'resume') expect(attempts.finishClaim).toHaveBeenCalled();
        else expect(attempts.finishClaim).not.toHaveBeenCalled();
        expect(disconnect).toHaveBeenCalledOnce();
        expect(close).toHaveBeenCalledOnce();
      } finally {
        finish();
        await (closing ?? app.close());
        disconnect.mockRestore();
        await prisma.$disconnect();
      }
    },
  );
});
