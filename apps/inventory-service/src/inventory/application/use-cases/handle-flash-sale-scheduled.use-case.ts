import { InvalidStockOperationError } from '../../domain/errors/invalid-stock-operation.error';
import { FlashSaleStockRepositoryPort } from '../../domain/repositories/flash-sale-stock.repository.port';
import { HandleFlashSaleScheduledCommand } from '../dto/handle-flash-sale-scheduled.command';
import { calculateFlashSaleScheduledPayloadHash } from '../services/flash-sale-scheduled-payload-hash';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class HandleFlashSaleScheduledUseCase {
  constructor(private readonly repository: FlashSaleStockRepositoryPort) {}

  async execute(command: HandleFlashSaleScheduledCommand): Promise<void> {
    validate(command);
    await this.repository.initializeFromFlashSaleScheduled({
      ...command,
      payloadHash: calculateFlashSaleScheduledPayloadHash(command),
    });
  }
}

function validate(command: HandleFlashSaleScheduledCommand): void {
  if (!UUID_V4_PATTERN.test(command.eventId)) {
    throw new InvalidStockOperationError('Flash sale event id must be a UUID v4.');
  }
  if (command.schemaVersion !== 1) {
    throw new InvalidStockOperationError('Unsupported flash sale event schema version.');
  }
  if (command.flashSaleId <= 0n) {
    throw new InvalidStockOperationError('Flash sale id must be positive.');
  }
  if (
    !validDate(command.startsAt) ||
    !validDate(command.endsAt) ||
    command.endsAt <= command.startsAt
  ) {
    throw new InvalidStockOperationError('Flash sale time window is invalid.');
  }
  if (command.items.length === 0) {
    throw new InvalidStockOperationError('Flash sale event must contain at least one item.');
  }

  const itemIds = new Set<string>();
  const skuIds = new Set<string>();
  for (const item of command.items) {
    if (item.flashSaleItemId <= 0n || item.productSkuId <= 0n) {
      throw new InvalidStockOperationError('Flash sale item and SKU ids must be positive.');
    }
    if (!Number.isInteger(item.stockLimit) || item.stockLimit <= 0) {
      throw new InvalidStockOperationError('Flash sale quantity limits must be positive integers.');
    }
    if (item.maxQuantityPerUser !== 1) {
      throw new InvalidStockOperationError('Flash sale maximum quantity per user must be 1.');
    }

    const itemId = item.flashSaleItemId.toString();
    const skuId = item.productSkuId.toString();
    if (itemIds.has(itemId)) {
      throw new InvalidStockOperationError('Flash sale event contains duplicate sale-item ids.');
    }
    if (skuIds.has(skuId)) {
      throw new InvalidStockOperationError('Flash sale event contains duplicate SKU ids.');
    }
    itemIds.add(itemId);
    skuIds.add(skuId);
  }
}

function validDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}
