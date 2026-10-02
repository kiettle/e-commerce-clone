export class InvalidProductEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = InvalidProductEventError.name;
  }
}
