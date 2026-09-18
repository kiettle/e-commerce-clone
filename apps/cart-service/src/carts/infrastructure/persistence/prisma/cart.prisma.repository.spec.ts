import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidCartOperationError } from '../../../domain/errors/invalid-cart-operation.error';
import { PrismaCartRepository } from './cart.prisma.repository';
import { PrismaService } from './prisma.service';

describe('PrismaCartRepository checkout freezing', () => {
  const cart = {
    id: 20n,
    userId: 10n,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const cartItem = {
    id: 30n,
    cartId: 20n,
    productId: 90n,
    productName: 'Example',
    imageUrl: null,
    productSkuId: 100n,
    skuCode: 'SKU-100',
    price: 19.9,
    quantity: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    cart,
  };

  let transaction: {
    $queryRaw: ReturnType<typeof vi.fn>;
    cart: { findUnique: ReturnType<typeof vi.fn> };
    cartItem: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    checkoutAttempt: { findUnique: ReturnType<typeof vi.fn> };
  };
  let repository: PrismaCartRepository;

  beforeEach(() => {
    transaction = {
      $queryRaw: vi.fn(),
      cart: { findUnique: vi.fn().mockResolvedValue(cart) },
      cartItem: {
        findUnique: vi.fn().mockResolvedValue(cartItem),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      checkoutAttempt: {
        findUnique: vi.fn().mockResolvedValue({ id: 'checkout-id' }),
      },
    };
    const prisma = {
      $transaction: vi.fn(
        async (work: (value: typeof transaction) => Promise<unknown>) =>
          work(transaction),
      ),
    };
    repository = new PrismaCartRepository(prisma as unknown as PrismaService);
  });

  it('rejects adding an item after checkout starts', async () => {
    await expect(
      repository.addOrIncrementItem(
        20n,
        {
          productId: 90n,
          productName: 'Example',
          imageUrl: null,
          productSkuId: 100n,
          skuCode: 'SKU-100',
          price: 19.9,
        },
        1,
      ),
    ).rejects.toBeInstanceOf(InvalidCartOperationError);
    expect(transaction.cartItem.create).not.toHaveBeenCalled();
    expect(transaction.cartItem.update).not.toHaveBeenCalled();
  });

  it('rejects updating an item after checkout starts', async () => {
    await expect(
      repository.updateItemQuantity(10n, 30n, 2),
    ).rejects.toBeInstanceOf(InvalidCartOperationError);
    expect(transaction.cartItem.update).not.toHaveBeenCalled();
  });

  it('rejects removing an item after checkout starts', async () => {
    await expect(repository.deleteItem(10n, 30n)).rejects.toBeInstanceOf(
      InvalidCartOperationError,
    );
    expect(transaction.cartItem.delete).not.toHaveBeenCalled();
  });
});
