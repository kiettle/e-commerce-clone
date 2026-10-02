export class ProductOutboxReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ProductOutboxReplayError.name;
  }
}
