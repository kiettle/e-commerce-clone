import { ReplayProductOutboxEventUseCase } from '../../application/use-cases/replay-product-outbox-event.use-case';

interface CliOutput {
  log(message: string): void;
  error(message: string): void;
}

export async function runProductOutboxReplayCli(
  eventId: string,
  replay: ReplayProductOutboxEventUseCase,
  output: CliOutput = console,
): Promise<number> {
  try {
    const result = await replay.execute(eventId);

    if (result.state === 'ALREADY_PENDING') {
      output.log(`Product outbox event ${result.eventId} is already pending.`);
      return 0;
    }

    output.log(`Product outbox event ${result.eventId} was reset to pending.`);
    return 0;
  } catch (error) {
    output.error(error instanceof Error ? error.message : 'Product outbox replay failed.');
    return 1;
  }
}
