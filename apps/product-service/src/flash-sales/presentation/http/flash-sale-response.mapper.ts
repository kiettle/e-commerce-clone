import { FlashSaleEntity } from '../../domain/entities/flash-sale.entity';
import { Clock } from '../../domain/services/clock';

export interface FlashSaleItemResponse {
  id: number;
  productSkuId: number;
  originalPrice: number;
  salePrice: number;
  quantity: number;
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
      quantity: item.quantity,
    })),
    createdAt: flashSale.createdAt.toISOString(),
    updatedAt: flashSale.updatedAt.toISOString(),
  };
}
