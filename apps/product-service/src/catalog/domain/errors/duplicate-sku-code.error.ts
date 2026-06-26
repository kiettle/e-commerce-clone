export class DuplicateSkuCodeError extends Error {
  constructor(skuCode: string) {
    super(`Duplicate SKU code: ${skuCode}.`);
  }
}
