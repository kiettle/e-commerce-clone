export class InvalidSkuQuantityError extends Error {
  constructor(skuCode: string, quantity: number) {
    super(`Quantity for SKU ${skuCode} must be a non-negative integer. Received: ${quantity}.`);
  }
}
