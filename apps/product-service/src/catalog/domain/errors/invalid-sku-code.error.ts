export class InvalidSkuCodeError extends Error {
  constructor() {
    super('SKU code must not be empty.');
  }
}
