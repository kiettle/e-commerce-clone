import { ProductStatus } from '../../domain/enums/product-status.enum';

export interface UpdateProductCommand {
  productId: bigint;
  name?: string;
  description?: string | null;
  imageUrl?: string | null;
  categoryId?: bigint;
  status?: ProductStatus;
}
