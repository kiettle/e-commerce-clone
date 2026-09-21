export interface FlashSaleItemCommand {
  productSkuId: bigint;
  salePrice: number;
  stockLimit: number;
  maxQuantityPerUser: number;
}

export interface CreateFlashSaleCommand {
  createdBy: bigint;
  name: string;
  description?: string | null;
  startsAt: Date;
  endsAt: Date;
  items: FlashSaleItemCommand[];
}

export interface UpdateFlashSaleCommand {
  flashSaleId: bigint;
  name: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  items: FlashSaleItemCommand[];
}
