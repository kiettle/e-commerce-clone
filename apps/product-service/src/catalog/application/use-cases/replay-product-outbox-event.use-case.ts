import { ProductOutboxReplayError } from '../errors/product-outbox-replay.error';
import { ProductOutboxRepositoryPort } from '../ports/product-outbox.repository.port';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ReplayProductOutboxEventResponse {
  eventId: string;
  state: 'REPLAYED' | 'ALREADY_PENDING';
}

export class ReplayProductOutboxEventUseCase {
  constructor(private readonly outbox: ProductOutboxRepositoryPort) {}

  async execute(eventId: string, now = new Date()): Promise<ReplayProductOutboxEventResponse> {
    if (!UUID_V4_PATTERN.test(eventId)) {
      throw new ProductOutboxReplayError('Event ID must be a UUID v4.');
    }

    const result = await this.outbox.replayFailed(eventId, now);

    switch (result.state) {
      case 'REPLAYED':
      case 'ALREADY_PENDING':
        return { eventId, state: result.state };
      case 'PROCESSING':
        if (result.leaseUntil && result.leaseUntil > now) {
          throw new ProductOutboxReplayError(
            `Event ${eventId} has an active processing lease until ${result.leaseUntil.toISOString()}.`,
          );
        }
        throw new ProductOutboxReplayError(
          `Event ${eventId} has an expired processing lease and will be reclaimed automatically.`,
        );
      case 'PUBLISHED':
        throw new ProductOutboxReplayError(`Published event ${eventId} cannot be replayed.`);
      case 'NOT_FOUND':
        throw new ProductOutboxReplayError(`Product outbox event ${eventId} was not found.`);
    }
  }
}
