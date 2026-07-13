import { CartEntity } from '../../domain/entities/cart.entity';
import { CartStatus } from '../../domain/enums/cart-status.enum';
import { InvalidCartOperationError } from '../../domain/errors/invalid-cart-operation.error';
import { ProductSnapshotNotFoundError } from '../../domain/errors/product-snapshot-not-found.error';
import { CartRepositoryPort } from '../../domain/repositories/cart.repository.port';
import { ProductCatalogPort } from '../ports/product-catalog.port';
import { AddCartItemUseCase } from './add-cart-item.use-case';

describe('AddCartItemUseCase', () => {
  let carts: jest.Mocked<CartRepositoryPort>;
  let productCatalog: jest.Mocked<ProductCatalogPort>;
  let useCase: AddCartItemUseCase;

  beforeEach(() => {
    carts = {
      getOrCreateActiveCart: jest.fn().mockResolvedValue(activeCart()),
      findById: jest.fn(),
      addOrIncrementItem: jest.fn().mockResolvedValue(activeCart()),
      updateItemQuantity: jest.fn(),
      deleteItem: jest.fn(),
      markCheckedOut: jest.fn(),
    };
    productCatalog = {
      getProductSkuSnapshot: jest.fn().mockResolvedValue({
        productId: 20n,
        productName: 'Orange Shirt',
        imageUrl: 'https://example.test/orange-shirt.png',
        productSkuId: 10n,
        skuCode: 'SHIRT-ORANGE-M',
        price: 12.5,
      }),
    };
    useCase = new AddCartItemUseCase(carts, productCatalog);
  });

  it('adds product snapshot to active cart', async () => {
    await useCase.execute({
      userId: 7n,
      productSkuId: 10n,
      quantity: 2,
    });

    expect(productCatalog.getProductSkuSnapshot).toHaveBeenCalledWith(10n);
    expect(carts.getOrCreateActiveCart).toHaveBeenCalledWith(7n);
    expect(carts.addOrIncrementItem).toHaveBeenCalledWith(
      1n,
      {
        productId: 20n,
        productName: 'Orange Shirt',
        imageUrl: 'https://example.test/orange-shirt.png',
        productSkuId: 10n,
        skuCode: 'SHIRT-ORANGE-M',
        price: 12.5,
      },
      2,
    );
  });

  it('fails when product snapshot is missing', async () => {
    productCatalog.getProductSkuSnapshot.mockResolvedValueOnce(null);

    await expect(
      useCase.execute({
        userId: 7n,
        productSkuId: 10n,
        quantity: 2,
      }),
    ).rejects.toBeInstanceOf(ProductSnapshotNotFoundError);
  });

  it('rejects non-positive quantity', async () => {
    await expect(
      useCase.execute({
        userId: 7n,
        productSkuId: 10n,
        quantity: 0,
      }),
    ).rejects.toBeInstanceOf(InvalidCartOperationError);
  });
});

function activeCart(): CartEntity {
  return new CartEntity({
    id: 1n,
    userId: 7n,
    status: CartStatus.Active,
  });
}
