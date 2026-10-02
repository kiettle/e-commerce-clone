import { InvalidStockOperationError } from '../../domain/errors/invalid-stock-operation.error';
import {
  InventoryRepositoryPort,
  StockOperationItem,
} from '../../domain/repositories/inventory.repository.port';
import { StockOperationCommand } from '../dto/stock-operation.command';

export class ReserveStockUseCase {
  constructor(private readonly inventory: InventoryRepositoryPort) {}

  async execute(command: StockOperationCommand): Promise<void> {
    validateStockOperation(command, true);
    const items = normalizeStockItems(command.items);

    if (items.length === 0) {
      throw new InvalidStockOperationError('Stock operation items are required.');
    }

    await this.inventory.reserveStock({ ...command, items });
  }
}

export function normalizeStockItems(items: StockOperationItem[]): StockOperationItem[] {
  const itemBySku = new Map<string, StockOperationItem>();

  for (const item of items) {
    if (item.productSkuId <= 0n) {
      throw new InvalidStockOperationError('Product SKU id must be greater than zero.');
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new InvalidStockOperationError('Stock quantity must be greater than zero.');
    }
    validateSaleContext(item);

    const key = item.productSkuId.toString();
    const existing = itemBySku.get(key);
    if (!existing) {
      itemBySku.set(key, {
        productSkuId: item.productSkuId,
        quantity: item.quantity,
        flashSaleId: item.flashSaleId ?? null,
        flashSaleItemId: item.flashSaleItemId ?? null,
      });
      continue;
    }
    if (
      existing.flashSaleId !== (item.flashSaleId ?? null) ||
      existing.flashSaleItemId !== (item.flashSaleItemId ?? null)
    ) {
      throw new InvalidStockOperationError('Duplicate SKU items must use the same sale context.');
    }
    existing.quantity += item.quantity;
  }

  return Array.from(itemBySku.values()).sort((left, right) =>
    left.productSkuId < right.productSkuId ? -1 : left.productSkuId > right.productSkuId ? 1 : 0,
  );
}

export function validateStockOperation(
  command: StockOperationCommand,
  requireUserId: boolean,
): void {
  if (command.cartId <= 0n) {
    throw new InvalidStockOperationError('Cart id must be greater than zero.');
  }
  if (!UUID_V4_PATTERN.test(command.checkoutId)) {
    throw new InvalidStockOperationError('Checkout id must be a UUID v4.');
  }
  if (requireUserId && command.userId <= 0n) {
    throw new InvalidStockOperationError('User id must be greater than zero.');
  }
}

function validateSaleContext(item: StockOperationItem): void {
  const hasSaleId = item.flashSaleId != null;
  const hasSaleItemId = item.flashSaleItemId != null;
  if (hasSaleId !== hasSaleItemId) {
    throw new InvalidStockOperationError('Both flash sale ids must be supplied together.');
  }
  if (
    (item.flashSaleId != null && item.flashSaleId <= 0n) ||
    (item.flashSaleItemId != null && item.flashSaleItemId <= 0n)
  ) {
    throw new InvalidStockOperationError('Flash sale ids must be greater than zero.');
  }
}

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
