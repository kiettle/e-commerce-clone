import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlashSaleQuantityExceededError } from '../../../domain/errors/flash-sale-quantity-exceeded.error';
import { InvalidCartOperationError } from '../../../domain/errors/invalid-cart-operation.error';
import { CartItemPriceSource } from '../../../domain/enums/cart-item-price-source.enum';
import { CartItemPricingChangedError } from '../../../domain/errors/cart-item-pricing-changed.error';
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
    flashSaleId: null,
    flashSaleItemId: null,
    skuCode: 'SKU-100',
    price: 19.9,
    regularPrice: 19.9,
    priceSource: CartItemPriceSource.Regular,
    saleEndsAt: null,
    maxPerUserQuantity: null,
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
      $transaction: vi.fn(async (work: (value: typeof transaction) => Promise<unknown>) =>
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
          regularPrice: 19.9,
          priceSource: CartItemPriceSource.Regular,
        },
        1,
      ),
    ).rejects.toBeInstanceOf(InvalidCartOperationError);
    expect(transaction.cartItem.create).not.toHaveBeenCalled();
    expect(transaction.cartItem.update).not.toHaveBeenCalled();
  });

  it('rejects updating an item after checkout starts', async () => {
    await expect(repository.updateItemQuantity(10n, 30n, 2)).rejects.toBeInstanceOf(
      InvalidCartOperationError,
    );
    expect(transaction.cartItem.update).not.toHaveBeenCalled();
  });

  it('rejects removing an item after checkout starts', async () => {
    await expect(repository.deleteItem(10n, 30n)).rejects.toBeInstanceOf(InvalidCartOperationError);
    expect(transaction.cartItem.delete).not.toHaveBeenCalled();
  });

  it('rejects adding the same SKU with another pricing context', async () => {
    transaction.checkoutAttempt.findUnique.mockResolvedValue(null);

    await expect(
      repository.addOrIncrementItem(
        20n,
        {
          productId: 90n,
          productName: 'Example',
          imageUrl: null,
          productSkuId: 100n,
          skuCode: 'SKU-100',
          price: 9.9,
          regularPrice: 19.9,
          priceSource: CartItemPriceSource.FlashSale,
          flashSaleId: 50n,
          flashSaleItemId: 501n,
          saleEndsAt: new Date('2026-10-01T10:00:00.000Z'),
          maxPerUserQuantity: 1,
        },
        1,
      ),
    ).rejects.toBeInstanceOf(CartItemPricingChangedError);
    expect(transaction.cartItem.update).not.toHaveBeenCalled();
  });

  it('rejects incrementing or updating a sale item above its limit', async () => {
    const saleItem = {
      ...cartItem,
      flashSaleId: 50n,
      flashSaleItemId: 501n,
      price: 9.9,
      priceSource: CartItemPriceSource.FlashSale,
      saleEndsAt: new Date('2026-10-01T10:00:00.000Z'),
      maxPerUserQuantity: 1,
    };
    transaction.checkoutAttempt.findUnique.mockResolvedValue(null);
    transaction.cartItem.findUnique.mockResolvedValue(saleItem);

    await expect(
      repository.addOrIncrementItem(
        20n,
        {
          productId: 90n,
          productName: 'Example',
          imageUrl: null,
          productSkuId: 100n,
          skuCode: 'SKU-100',
          price: 9.9,
          regularPrice: 19.9,
          priceSource: CartItemPriceSource.FlashSale,
          flashSaleId: 50n,
          flashSaleItemId: 501n,
          saleEndsAt: saleItem.saleEndsAt,
          maxPerUserQuantity: 1,
        },
        1,
      ),
    ).rejects.toBeInstanceOf(FlashSaleQuantityExceededError);

    await expect(repository.updateItemQuantity(10n, 30n, 2)).rejects.toBeInstanceOf(
      FlashSaleQuantityExceededError,
    );
    expect(transaction.cartItem.update).not.toHaveBeenCalled();
  });
});
