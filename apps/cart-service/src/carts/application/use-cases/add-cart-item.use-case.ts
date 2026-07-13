import { CartEntity } from '../../domain/entities/cart.entity';
import { InvalidCartOperationError } from '../../domain/errors/invalid-cart-operation.error';
import { ProductSnapshotNotFoundError } from '../../domain/errors/product-snapshot-not-found.error';
import { CartRepositoryPort } from '../../domain/repositories/cart.repository.port';
import { AddCartItemCommand } from '../dto/add-cart-item.command';
import { ProductCatalogPort } from '../ports/product-catalog.port';
import { assertPositiveId } from './get-active-cart.use-case';

export class AddCartItemUseCase {
  constructor(
    private readonly carts: CartRepositoryPort,
    private readonly productCatalog: ProductCatalogPort,
  ) {}

  async execute(command: AddCartItemCommand): Promise<CartEntity> {
    assertPositiveId(command.userId, 'Cart userId must be greater than zero.');
    assertPositiveId(
      command.productSkuId,
      'Cart item productSkuId must be greater than zero.',
    );
    assertPositiveQuantity(command.quantity);

    const productSnapshot = await this.productCatalog.getProductSkuSnapshot(
      command.productSkuId,
    );

    if (!productSnapshot) {
      throw new ProductSnapshotNotFoundError(command.productSkuId);
    }

    const cart = await this.carts.getOrCreateActiveCart(command.userId);

    return this.carts.addOrIncrementItem(
      cart.id,
      {
        productId: productSnapshot.productId,
        productName: productSnapshot.productName,
        imageUrl: productSnapshot.imageUrl,
        productSkuId: productSnapshot.productSkuId,
        skuCode: productSnapshot.skuCode,
        price: productSnapshot.price,
      },
      command.quantity,
    );
  }
}

export function assertPositiveQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new InvalidCartOperationError(
      'Cart item quantity must be greater than zero.',
    );
  }
}
