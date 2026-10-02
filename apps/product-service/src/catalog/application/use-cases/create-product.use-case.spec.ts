import { afterEach, beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { CategoryEntity } from '../../domain/entities/category.entity';
import { ProductEntity } from '../../domain/entities/product.entity';
import { ProductSkuEntity } from '../../domain/entities/product-sku.entity';
import { ProductSkuStatus } from '../../domain/enums/product-sku-status.enum';
import { ProductStatus } from '../../domain/enums/product-status.enum';
import { CategoryNotFoundError } from '../../domain/errors/category-not-found.error';
import { DuplicateSkuCodeError } from '../../domain/errors/duplicate-sku-code.error';
import { InvalidSkuCodeError } from '../../domain/errors/invalid-sku-code.error';
import { InvalidSkuQuantityError } from '../../domain/errors/invalid-sku-quantity.error';
import { CategoryRepositoryPort } from '../../domain/repositories/category.repository.port';
import { CreateProductCommand } from '../dto/create-product.command';
import { ProductCreationRepositoryPort } from '../ports/product-creation.repository.port';
import { CreateProductUseCase } from './create-product.use-case';

describe('CreateProductUseCase', () => {
  const eventId = '550e8400-e29b-41d4-a716-446655440000';
  const occurredAt = new Date('2026-09-20T08:00:00.000Z');
  const command: CreateProductCommand = {
    name: 'Mechanical Keyboard',
    description: 'Hot-swappable keyboard',
    imageUrl: 'https://example.com/keyboard.png',
    categoryId: 3n,
    sellerId: 7n,
    status: ProductStatus.Active,
    skus: [
      {
        skuCode: 'KEYBOARD-BLACK',
        price: 79.9,
        status: ProductSkuStatus.Available,
        quantity: 12,
      },
      {
        skuCode: 'KEYBOARD-WHITE',
        price: 84.9,
        status: ProductSkuStatus.OutOfStock,
        quantity: 0,
      },
    ],
  };

  let categories: Mocked<CategoryRepositoryPort>;
  let products: Mocked<ProductCreationRepositoryPort>;
  let useCase: CreateProductUseCase;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(occurredAt);
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(eventId);
    categories = {
      create: vi.fn(),
      findAll: vi.fn(),
      findById: vi
        .fn()
        .mockResolvedValue(
          new CategoryEntity({ id: 3n, name: 'Accessories', slug: 'accessories' }),
        ),
    };
    products = {
      createWithOutbox: vi.fn().mockResolvedValue(persistedProduct()),
    };
    useCase = new CreateProductUseCase(categories, products);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rejects a missing category before persistence', async () => {
    categories.findById.mockResolvedValue(null);

    await expect(useCase.execute(command)).rejects.toBeInstanceOf(CategoryNotFoundError);
    expect(products.createWithOutbox).not.toHaveBeenCalled();
  });

  it('rejects duplicate SKU codes before persistence', async () => {
    const duplicateCommand = {
      ...command,
      skus: [command.skus[0], { ...command.skus[1], skuCode: 'KEYBOARD-BLACK' }],
    };

    await expect(useCase.execute(duplicateCommand)).rejects.toBeInstanceOf(DuplicateSkuCodeError);
    expect(products.createWithOutbox).not.toHaveBeenCalled();
  });

  it('rejects an empty SKU code before persistence', async () => {
    await expect(
      useCase.execute({
        ...command,
        skus: [{ ...command.skus[0], skuCode: '  ' }],
      }),
    ).rejects.toBeInstanceOf(InvalidSkuCodeError);
    expect(products.createWithOutbox).not.toHaveBeenCalled();
  });

  it.each([-1, 1.5])('rejects invalid SKU quantity %s before persistence', async (quantity) => {
    await expect(
      useCase.execute({
        ...command,
        skus: [{ ...command.skus[0], quantity }],
      }),
    ).rejects.toBeInstanceOf(InvalidSkuQuantityError);
    expect(products.createWithOutbox).not.toHaveBeenCalled();
  });

  it('persists product, quantities, and event metadata through one port', async () => {
    const product = persistedProduct();
    products.createWithOutbox.mockResolvedValue(product);

    await expect(useCase.execute(command)).resolves.toBe(product);
    expect(products.createWithOutbox).toHaveBeenCalledWith({
      eventId,
      occurredAt,
      name: command.name,
      description: command.description,
      imageUrl: command.imageUrl,
      categoryId: command.categoryId,
      sellerId: command.sellerId,
      status: command.status,
      skus: command.skus,
    });
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledOnce();
  });

  function persistedProduct(): ProductEntity {
    return new ProductEntity({
      id: 20n,
      name: command.name,
      description: command.description,
      imageUrl: command.imageUrl,
      categoryId: command.categoryId,
      sellerId: command.sellerId,
      status: command.status,
      skus: [
        new ProductSkuEntity({
          id: 101n,
          productId: 20n,
          skuCode: 'KEYBOARD-BLACK',
          price: 79.9,
          status: ProductSkuStatus.Available,
        }),
        new ProductSkuEntity({
          id: 102n,
          productId: 20n,
          skuCode: 'KEYBOARD-WHITE',
          price: 84.9,
          status: ProductSkuStatus.OutOfStock,
        }),
      ],
    });
  }
});
