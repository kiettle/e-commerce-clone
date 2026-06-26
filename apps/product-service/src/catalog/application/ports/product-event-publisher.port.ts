import { ProductSkuStatus } from '../../domain/enums/product-sku-status.enum';

export const PRODUCT_EVENT_PUBLISHER = Symbol('PRODUCT_EVENT_PUBLISHER');

export interface ProductCreatedEventSku {
  productSkuId: bigint;
  skuCode: string;
  status: ProductSkuStatus;
  quantity: number;
}

export interface ProductCreatedEvent {
  productId: bigint;
  name: string;
  skus: ProductCreatedEventSku[];
}

export interface ProductEventPublisherPort {
  publishProductCreated(event: ProductCreatedEvent): Promise<void>;
}
