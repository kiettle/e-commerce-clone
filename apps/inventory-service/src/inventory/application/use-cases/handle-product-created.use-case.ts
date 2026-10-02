import { InvalidStockOperationError } from '../../domain/errors/invalid-stock-operation.error';
import { InventoryRepositoryPort } from '../../domain/repositories/inventory.repository.port';
import { HandleProductCreatedCommand } from '../dto/handle-product-created.command';
import { calculateProductCreatedPayloadHash } from '../services/product-created-payload-hash';

const PRODUCT_CREATED_SCHEMA_VERSION = 1;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class HandleProductCreatedUseCase {
  constructor(private readonly inventory: InventoryRepositoryPort) {}

  async execute(command: HandleProductCreatedCommand): Promise<void> {
    if (!UUID_PATTERN.test(command.eventId)) {
      throw new InvalidStockOperationError('Product event id must be a UUID v4.');
    }

    if (command.schemaVersion !== PRODUCT_CREATED_SCHEMA_VERSION) {
      throw new InvalidStockOperationError('Unsupported product event schema version.');
    }

    if (command.productId <= 0n) {
      throw new InvalidStockOperationError('Product id must be positive.');
    }

    if (command.skus.length === 0) {
      throw new InvalidStockOperationError('Product event must contain at least one SKU.');
    }

    const skuIds = new Set<string>();
    const skuCodes = new Set<string>();

    for (const sku of command.skus) {
      if (sku.productSkuId <= 0n) {
        throw new InvalidStockOperationError('Product SKU id must be positive.');
      }

      if (!sku.skuCode.trim()) {
        throw new InvalidStockOperationError('Product SKU code must not be blank.');
      }

      if (!Number.isInteger(sku.quantity) || sku.quantity < 0) {
        throw new InvalidStockOperationError('Initial quantity must be a non-negative integer.');
      }

      const skuId = sku.productSkuId.toString();
      if (skuIds.has(skuId)) {
        throw new InvalidStockOperationError('Product event contains duplicate SKU ids.');
      }

      const skuCode = sku.skuCode.trim();
      if (skuCodes.has(skuCode)) {
        throw new InvalidStockOperationError('Product event contains duplicate SKU codes.');
      }

      skuIds.add(skuId);
      skuCodes.add(skuCode);
    }

    await this.inventory.initializeFromProductCreated({
      ...command,
      payloadHash: calculateProductCreatedPayloadHash(command),
    });
  }
}
