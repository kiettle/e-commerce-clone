import { FlashSaleEntity } from '../../domain/entities/flash-sale.entity';
import { Clock } from '../../domain/services/clock';

export interface FlashSaleItemResponse {
  id: number;
  productSkuId: number;
  originalPrice: number;
  salePrice: number;
  stockLimit: number;
  maxQuantityPerUser: number;
}

export interface FlashSaleResponse {
  id: number;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  items: FlashSaleItemResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface PublicFlashSaleItemResponse {
  id: number;
  productSkuId: number;
  productName: string;
  imageUrl: string | null;
  originalPrice: number;
  salePrice: number;
  availability: 'UNKNOWN';
  maxQuantityPerUser: number;
}

export interface PublicFlashSaleResponse extends Omit<FlashSaleResponse, 'items'> {
  items: PublicFlashSaleItemResponse[];
}

const systemClock: Clock = { now: () => new Date() };

export function toFlashSaleResponse(
  flashSale: FlashSaleEntity,
  clock: Clock = systemClock,
): FlashSaleResponse {
  if (
    flashSale.id === undefined ||
    flashSale.createdAt === undefined ||
    flashSale.updatedAt === undefined ||
    flashSale.items.some((item) => item.id === undefined)
  ) {
    throw new Error('A persisted flash sale is required for an HTTP response.');
  }

  return {
    id: Number(flashSale.id),
    name: flashSale.name,
    description: flashSale.description,
    startsAt: flashSale.startsAt.toISOString(),
    endsAt: flashSale.endsAt.toISOString(),
    status: flashSale.getEffectiveStatus(clock),
    items: flashSale.items.map((item) => ({
      id: Number(item.id),
      productSkuId: Number(item.productSkuId),
      originalPrice: item.originalPrice,
      salePrice: item.salePrice,
      stockLimit: item.stockLimit,
      maxQuantityPerUser: item.maxQuantityPerUser,
    })),
    createdAt: flashSale.createdAt.toISOString(),
    updatedAt: flashSale.updatedAt.toISOString(),
  };
}

export function toPublicFlashSaleResponse(
  flashSale: FlashSaleEntity,
  clock: Clock = systemClock,
): PublicFlashSaleResponse {
  const response = toFlashSaleResponse(flashSale, clock);
  return {
    ...response,
    items: flashSale.items.map((item) => ({
      id: Number(item.id),
      productSkuId: Number(item.productSkuId),
      productName: item.productName ?? '',
      imageUrl: item.imageUrl ?? null,
      originalPrice: item.originalPrice,
      salePrice: item.salePrice,
      availability: 'UNKNOWN' as const,
      maxQuantityPerUser: item.maxQuantityPerUser,
    })),
  };
}
