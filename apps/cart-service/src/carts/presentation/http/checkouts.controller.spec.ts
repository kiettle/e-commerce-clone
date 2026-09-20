import { NotFoundException } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { GetCheckoutStatusUseCase } from '../../application/use-cases/get-checkout-status.use-case';
import { CheckoutAttemptEntity } from '../../domain/entities/checkout-attempt.entity';
import { CheckoutStatus } from '../../domain/enums/checkout-status.enum';
import { CheckoutNotFoundError } from '../../domain/errors/checkout-not-found.error';
import { CartsController } from './carts.controller';
import { CheckoutsController } from './checkouts.controller';

describe('CheckoutsController', () => {
  const checkoutId = '018f47a1-7b72-4c7f-8c52-f06612de3377';
  let useCase: Mocked<GetCheckoutStatusUseCase>;
  let controller: CheckoutsController;

  beforeEach(() => {
    useCase = { execute: vi.fn() } as unknown as Mocked<GetCheckoutStatusUseCase>;
    controller = new CheckoutsController(useCase);
  });

  it('maps an owned checkout to the public response contract', async () => {
    useCase.execute.mockResolvedValue(
      new CheckoutAttemptEntity({
        id: checkoutId,
        userId: 10n,
        cartId: 20n,
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        requestHash: 'a'.repeat(64),
        itemsSnapshot: [],
        status: CheckoutStatus.Failed,
        lastError: 'Sensitive database failure details.',
        createdAt: new Date('2026-09-16T08:00:00.000Z'),
        updatedAt: new Date('2026-09-16T08:00:05.000Z'),
      }),
    );

    await expect(
      controller.getCheckoutStatus('10', checkoutId),
    ).resolves.toEqual({
      checkoutId,
      cartId: 20,
      status: CheckoutStatus.Failed,
      orderId: null,
      lastError: 'Checkout failed.',
      createdAt: '2026-09-16T08:00:00.000Z',
      updatedAt: '2026-09-16T08:00:05.000Z',
    });
    expect(useCase.execute).toHaveBeenCalledWith(10n, checkoutId);
  });

  it('maps unknown and non-owned checkouts to 404', async () => {
    useCase.execute.mockRejectedValue(new CheckoutNotFoundError(checkoutId));

    await expect(
      controller.getCheckoutStatus('10', checkoutId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('checkout POST response contract', () => {
  it('declares successful checkout as HTTP 200', () => {
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        CartsController.prototype.checkoutCart,
      ),
    ).toBe(200);
  });
});
