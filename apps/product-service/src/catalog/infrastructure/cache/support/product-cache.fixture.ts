import { ProductEntity } from '../../../domain/entities/product.entity';
import { ProductSkuEntity } from '../../../domain/entities/product-sku.entity';
import { ProductStatus } from '../../../domain/enums/product-status.enum';
import { ProductSkuStatus } from '../../../domain/enums/product-sku-status.enum';

export function cachedProduct(): ProductEntity {
  return new ProductEntity({
    id: 9007199254740993n,
    name: 'Keyboard',
    description: null,
    categoryId: 7n,
    sellerId: 8n,
    status: ProductStatus.Active,
    createdAt: new Date('2026-10-08T01:00:00.000Z'),
    updatedAt: new Date('2026-10-08T02:00:00.000Z'),
    skus: [
      new ProductSkuEntity({
        id: 9007199254740994n,
        productId: 9007199254740993n,
        skuCode: 'KEYBOARD-BLACK',
        price: 19.95,
        status: ProductSkuStatus.Available,
        createdAt: new Date('2026-10-08T01:00:00.000Z'),
        updatedAt: new Date('2026-10-08T02:00:00.000Z'),
      }),
    ],
  });
}
