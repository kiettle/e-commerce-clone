export class ConflictingFlashSaleEventError extends Error {
  constructor(eventId: string) {
    super(`Flash sale event ${eventId} was already processed with a different payload.`);
    this.name = ConflictingFlashSaleEventError.name;
  }
}
