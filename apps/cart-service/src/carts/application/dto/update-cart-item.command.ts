export interface UpdateCartItemCommand {
  userId: bigint;
  cartItemId: bigint;
  quantity: number;
}
