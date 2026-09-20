export interface FlashSaleItemCommand {
  productSkuId: bigint;
  salePrice: number;
  quantity: number;
}

export interface CreateFlashSaleCommand {
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
