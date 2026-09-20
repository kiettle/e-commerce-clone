import { describe, expect, it, vi } from 'vitest';
import { ProductOutboxReplayError } from '../errors/product-outbox-replay.error';
import {
  ProductOutboxRepositoryPort,
  ReplayProductOutboxResult,
} from '../ports/product-outbox.repository.port';
import { ReplayProductOutboxEventUseCase } from './replay-product-outbox-event.use-case';

const eventId = '550e8400-e29b-41d4-a716-446655440000';
const now = new Date('2026-09-20T08:00:00.000Z');

describe('ReplayProductOutboxEventUseCase', () => {
  it('replays a failed event using the supplied retry time', async () => {
    const repository = fakeRepository({ state: 'REPLAYED' });
    const useCase = new ReplayProductOutboxEventUseCase(repository);

    await expect(useCase.execute(eventId, now)).resolves.toEqual({
      eventId,
      state: 'REPLAYED',
    });
    expect(repository.replayFailed).toHaveBeenCalledWith(eventId, now);
  });

  it('reports an event that is already pending without replaying another row', async () => {
    const repository = fakeRepository({ state: 'ALREADY_PENDING' });
    const useCase = new ReplayProductOutboxEventUseCase(repository);

    await expect(useCase.execute(eventId, now)).resolves.toEqual({
      eventId,
      state: 'ALREADY_PENDING',
    });
  });

  it.each([
    {
      result: {
        state: 'PROCESSING',
        leaseUntil: new Date('2026-09-20T08:01:00.000Z'),
      } as const,
      message: 'active processing lease',
    },
    {
      result: {
        state: 'PROCESSING',
        leaseUntil: new Date('2026-09-20T07:59:00.000Z'),
      } as const,
      message: 'expired processing lease',
    },
    {
      result: { state: 'PUBLISHED' } as const,
      message: 'cannot be replayed',
    },
    {
      result: { state: 'NOT_FOUND' } as const,
      message: 'was not found',
    },
  ])('rejects $result.state events with $message', async ({ result, message }) => {
    const useCase = new ReplayProductOutboxEventUseCase(fakeRepository(result));

    await expect(useCase.execute(eventId, now)).rejects.toThrow(message);
  });

  it('rejects a malformed event ID before accessing the repository', async () => {
    const repository = fakeRepository({ state: 'REPLAYED' });
    const useCase = new ReplayProductOutboxEventUseCase(repository);

    await expect(useCase.execute('not-a-uuid', now)).rejects.toBeInstanceOf(
      ProductOutboxReplayError,
    );
    expect(repository.replayFailed).not.toHaveBeenCalled();
  });
});

function fakeRepository(result: ReplayProductOutboxResult): ProductOutboxRepositoryPort {
  return {
    claimBatch: vi.fn(),
    markPublished: vi.fn(),
    markFailedAttempt: vi.fn(),
    replayFailed: vi.fn().mockResolvedValue(result),
  };
}
