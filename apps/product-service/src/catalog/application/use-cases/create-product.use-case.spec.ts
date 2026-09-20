import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { CategoryEntity } from '../../domain/entities/category.entity';
import { ProductEntity } from '../../domain/entities/product.entity';
import { ProductSkuEntity } from '../../domain/entities/product-sku.entity';
import { ProductSkuStatus } from '../../domain/enums/product-sku-status.enum';
import { ProductStatus } from '../../domain/enums/product-status.enum';
import { CategoryNotFoundError } from '../../domain/errors/category-not-found.error';
import { DuplicateSkuCodeError } from '../../domain/errors/duplicate-sku-code.error';
import { CategoryRepositoryPort } from '../../domain/repositories/category.repository.port';
import { ProductRepositoryPort } from '../../domain/repositories/product.repository.port';
import { CreateProductCommand } from '../dto/create-product.command';
import { ProductEventPublisherPort } from '../ports/product-event-publisher.port';
import { CreateProductUseCase } from './create-product.use-case';

describe('CreateProductUseCase', () => {
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
  let products: Mocked<ProductRepositoryPort>;
  let events: Mocked<ProductEventPublisherPort>;
  let useCase: CreateProductUseCase;

  beforeEach(() => {
    categories = {
      create: vi.fn(),
      findAll: vi.fn(),
      findById: vi.fn().mockResolvedValue(
        new CategoryEntity({ id: 3n, name: 'Accessories', slug: 'accessories' }),
      ),
    };
    products = {
      create: vi.fn().mockResolvedValue(persistedProduct()),
      findById: vi.fn(),
      search: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    };
    events = {
      publishProductCreated: vi.fn(),
    };
    useCase = new CreateProductUseCase(categories, products, events);
  });

  it('rejects a missing category before persistence', async () => {
    categories.findById.mockResolvedValue(null);

    await expect(useCase.execute(command)).rejects.toBeInstanceOf(
      CategoryNotFoundError,
    );
    expect(products.create).not.toHaveBeenCalled();
    expect(events.publishProductCreated).not.toHaveBeenCalled();
  });

  it('rejects duplicate SKU codes before persistence', async () => {
    const duplicateCommand = {
      ...command,
      skus: [command.skus[0], { ...command.skus[1], skuCode: 'KEYBOARD-BLACK' }],
    };

    await expect(useCase.execute(duplicateCommand)).rejects.toBeInstanceOf(
      DuplicateSkuCodeError,
    );
    expect(products.create).not.toHaveBeenCalled();
    expect(events.publishProductCreated).not.toHaveBeenCalled();
  });

  it('persists the requested product and SKU fields', async () => {
    await useCase.execute(command);

    expect(products.create).toHaveBeenCalledWith({
      name: command.name,
      description: command.description,
      imageUrl: command.imageUrl,
      categoryId: command.categoryId,
      sellerId: command.sellerId,
      status: command.status,
      skus: command.skus.map((sku) => ({
        skuCode: sku.skuCode,
        price: sku.price,
        status: sku.status,
      })),
    });
  });

  it('publishes the initial quantity for every persisted SKU', async () => {
    await useCase.execute(command);

    expect(events.publishProductCreated).toHaveBeenCalledWith({
      productId: 20n,
      name: command.name,
      skus: [
        {
          productSkuId: 102n,
          skuCode: 'KEYBOARD-WHITE',
          status: ProductSkuStatus.OutOfStock,
          quantity: 0,
        },
        {
          productSkuId: 101n,
          skuCode: 'KEYBOARD-BLACK',
          status: ProductSkuStatus.Available,
          quantity: 12,
        },
      ],
    });
  });

  it('persists before publishing, exposing the current dual-write window', async () => {
    events.publishProductCreated.mockRejectedValue(
      new Error('Kafka unavailable.'),
    );

    await expect(useCase.execute(command)).rejects.toThrow('Kafka unavailable.');
    expect(products.create).toHaveBeenCalledOnce();
    expect(events.publishProductCreated).toHaveBeenCalledOnce();
    expect(products.create).toHaveBeenCalledBefore(
      events.publishProductCreated,
    );
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
          id: 102n,
          productId: 20n,
          skuCode: 'KEYBOARD-WHITE',
          price: 84.9,
          status: ProductSkuStatus.OutOfStock,
        }),
        new ProductSkuEntity({
          id: 101n,
          productId: 20n,
          skuCode: 'KEYBOARD-BLACK',
          price: 79.9,
          status: ProductSkuStatus.Available,
        }),
      ],
    });
  }
});
