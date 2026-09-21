import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { CartEntity } from '../../domain/entities/cart.entity';
import { CartItemPriceSource } from '../../domain/enums/cart-item-price-source.enum';
import { CartStatus } from '../../domain/enums/cart-status.enum';
import { FlashSaleQuantityExceededError } from '../../domain/errors/flash-sale-quantity-exceeded.error';
import { CartRepositoryPort } from '../../domain/repositories/cart.repository.port';
import { ProductCatalogPort } from '../ports/product-catalog.port';
import { AddCartItemUseCase } from './add-cart-item.use-case';

describe('AddCartItemUseCase sale pricing', () => {
  const cart = new CartEntity({ id: 20n, userId: 10n, status: CartStatus.Active });
  const saleEndsAt = new Date('2026-10-01T10:00:00.000Z');
  let carts: Mocked<CartRepositoryPort>;
  let catalog: Mocked<ProductCatalogPort>;
  let useCase: AddCartItemUseCase;

  beforeEach(() => {
    carts = {
      getOrCreateActiveCart: vi.fn().mockResolvedValue(cart),
      findById: vi.fn(),
      addOrIncrementItem: vi.fn().mockResolvedValue(cart),
      updateItemQuantity: vi.fn(),
      deleteItem: vi.fn(),
      markCheckedOut: vi.fn(),
    };
    catalog = {
      getProductSkuSnapshot: vi.fn().mockResolvedValue({
        productId: 90n,
        productName: 'Keyboard',
        imageUrl: null,
        productSkuId: 100n,
        skuCode: 'KB-BLACK',
        price: 75,
        regularPrice: 100,
        priceSource: 'FLASH_SALE',
        flashSaleId: 50n,
        flashSaleItemId: 501n,
        saleEndsAt,
        maxPerUserQuantity: 1,
      }),
    };
    useCase = new AddCartItemUseCase(carts, catalog);
  });

  it('stores the complete product-owned sale snapshot', async () => {
    await useCase.execute({ userId: 10n, productSkuId: 100n, quantity: 1 });

    expect(carts.addOrIncrementItem).toHaveBeenCalledWith(
      20n,
      {
        productId: 90n,
        productName: 'Keyboard',
        imageUrl: null,
        productSkuId: 100n,
        skuCode: 'KB-BLACK',
        price: 75,
        regularPrice: 100,
        priceSource: CartItemPriceSource.FlashSale,
        flashSaleId: 50n,
        flashSaleItemId: 501n,
        saleEndsAt,
        maxPerUserQuantity: 1,
      },
      1,
    );
  });

  it('rejects an initial sale quantity above the product-owned limit', async () => {
    await expect(
      useCase.execute({ userId: 10n, productSkuId: 100n, quantity: 2 }),
    ).rejects.toBeInstanceOf(FlashSaleQuantityExceededError);
    expect(carts.getOrCreateActiveCart).not.toHaveBeenCalled();
    expect(carts.addOrIncrementItem).not.toHaveBeenCalled();
  });
});
