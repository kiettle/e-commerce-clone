export interface AddCartItemCommand {
  userId: bigint;
  productSkuId: bigint;
  quantity: number;
}
