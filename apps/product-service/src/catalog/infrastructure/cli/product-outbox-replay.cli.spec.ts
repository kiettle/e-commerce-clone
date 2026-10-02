import { describe, expect, it, vi } from 'vitest';
import { ReplayProductOutboxEventUseCase } from '../../application/use-cases/replay-product-outbox-event.use-case';
import { runProductOutboxReplayCli } from './product-outbox-replay.cli';

const eventId = '550e8400-e29b-41d4-a716-446655440000';

describe('runProductOutboxReplayCli', () => {
  it('reports a successful replay without printing the payload', async () => {
    const replay = fakeUseCase({ eventId, state: 'REPLAYED' });
    const output = fakeOutput();

    await expect(runProductOutboxReplayCli(eventId, replay, output)).resolves.toBe(0);
    expect(output.log).toHaveBeenCalledWith(
      `Product outbox event ${eventId} was reset to pending.`,
    );
    expect(allOutput(output)).not.toContain('payload');
  });

  it('reports an already-pending event as a successful no-op', async () => {
    const replay = fakeUseCase({ eventId, state: 'ALREADY_PENDING' });
    const output = fakeOutput();

    await expect(runProductOutboxReplayCli(eventId, replay, output)).resolves.toBe(0);
    expect(output.log).toHaveBeenCalledWith(`Product outbox event ${eventId} is already pending.`);
  });

  it('returns a non-zero exit code when replay is rejected', async () => {
    const replay = fakeUseCase(new Error(`Published event ${eventId} cannot be replayed.`));
    const output = fakeOutput();

    await expect(runProductOutboxReplayCli(eventId, replay, output)).resolves.toBe(1);
    expect(output.error).toHaveBeenCalledWith(`Published event ${eventId} cannot be replayed.`);
    expect(output.log).not.toHaveBeenCalled();
  });
});

function fakeUseCase(
  result: { eventId: string; state: 'REPLAYED' | 'ALREADY_PENDING' } | Error,
): ReplayProductOutboxEventUseCase {
  return {
    execute:
      result instanceof Error
        ? vi.fn().mockRejectedValue(result)
        : vi.fn().mockResolvedValue(result),
  } as unknown as ReplayProductOutboxEventUseCase;
}

function fakeOutput() {
  return {
    log: vi.fn<(message: string) => void>(),
    error: vi.fn<(message: string) => void>(),
  };
}

function allOutput(output: ReturnType<typeof fakeOutput>): string {
  return [...output.log.mock.calls, ...output.error.mock.calls].flat().join('\n');
}
