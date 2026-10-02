export interface CheckoutCartCommand {
  userId: bigint;
  cartId: bigint;
  idempotencyKey: string;
}
