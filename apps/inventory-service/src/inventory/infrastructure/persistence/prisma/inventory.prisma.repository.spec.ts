import { describe, expect, it, vi } from 'vitest';
import { StockReservationStatus } from '../../../domain/enums/stock-reservation-status.enum';
import { StockTransactionType } from '../../../domain/enums/stock-transaction-type.enum';
import { ConflictingProductEventError } from '../../../domain/errors/conflicting-product-event.error';
import { InvalidStockOperationError } from '../../../domain/errors/invalid-stock-operation.error';
import { PrismaInventoryRepository } from './inventory.prisma.repository';
import { PrismaService } from './prisma.service';

describe('PrismaInventoryRepository product initialization', () => {
  const event = {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    schemaVersion: 1,
    payloadHash: 'a'.repeat(64),
    productId: 20n,
    name: 'Mechanical Keyboard',
    skus: [
      {
        productSkuId: 101n,
        skuCode: 'KEYBOARD-BLACK',
        status: 'AVAILABLE',
        quantity: 12,
      },
      {
        productSkuId: 102n,
        skuCode: 'KEYBOARD-WHITE',
        status: 'OUT_OF_STOCK',
        quantity: 0,
      },
    ],
  };

  it('initializes every SKU and records the processed event', async () => {
    const { repository, transaction } = setupInitialization();

    await repository.initializeFromProductCreated(event);

    expect(transaction.inventoryStock.create).toHaveBeenCalledTimes(2);
    expect(transaction.inventoryStock.create).toHaveBeenNthCalledWith(1, {
      data: {
        productId: 20n,
        productSkuId: 101n,
        skuCode: 'KEYBOARD-BLACK',
        status: 'ACTIVE',
        availableQuantity: 12,
        reservedQuantity: 0,
      },
    });
    expect(transaction.inventoryStock.create).toHaveBeenNthCalledWith(2, {
      data: {
        productId: 20n,
        productSkuId: 102n,
        skuCode: 'KEYBOARD-WHITE',
        status: 'ACTIVE',
        availableQuantity: 0,
        reservedQuantity: 0,
      },
    });
    expect(transaction.stockTransaction.create).toHaveBeenCalledTimes(2);
    expect(transaction.stockTransaction.create).toHaveBeenNthCalledWith(1, {
      data: {
        productSkuId: 101n,
        type: StockTransactionType.Initialize,
        quantity: 12,
      },
    });
    expect(transaction.stockTransaction.create).toHaveBeenNthCalledWith(2, {
      data: {
        productSkuId: 102n,
        type: StockTransactionType.Initialize,
        quantity: 0,
      },
    });
    expect(transaction.processedProductEvent.create).toHaveBeenCalledWith({
      data: {
        eventId: event.eventId,
        eventType: 'PRODUCT_CREATED',
        schemaVersion: 1,
        payloadHash: event.payloadHash,
        productId: 20n,
      },
    });
    expect(transaction.processedProductEvent.create.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.inventoryStock.create.mock.invocationCallOrder[0],
    );
  });

  it('treats a repeated event ID with the same hash as a no-op', async () => {
    const { repository, prisma, transaction } = setupInitialization({
      markerError: uniqueConstraintError(),
      existingMarker: {
        eventId: event.eventId,
        payloadHash: event.payloadHash,
      },
    });

    await repository.initializeFromProductCreated(event);

    expect(transaction.inventoryStock.create).not.toHaveBeenCalled();
    expect(transaction.stockTransaction.create).not.toHaveBeenCalled();
    expect(prisma.processedProductEvent.findUnique).toHaveBeenCalledWith({
      where: { eventId: event.eventId },
    });
  });

  it('rejects a repeated event ID with a different hash', async () => {
    const { repository, transaction } = setupInitialization({
      markerError: uniqueConstraintError(),
      existingMarker: {
        eventId: event.eventId,
        payloadHash: 'b'.repeat(64),
      },
    });

    await expect(repository.initializeFromProductCreated(event)).rejects.toBeInstanceOf(
      ConflictingProductEventError,
    );
    expect(transaction.inventoryStock.create).not.toHaveBeenCalled();
  });
});

describe('PrismaInventoryRepository reservation completion', () => {
  it('commits a reservation without restoring available quantity', async () => {
    const { repository, transaction } = setup([reservation(101n, StockReservationStatus.Reserved)]);

    await repository.commitStock(55n, [{ productSkuId: 101n, quantity: 2 }]);

    expect(transaction.inventoryStock.updateMany).toHaveBeenCalledWith({
      where: { productSkuId: 101n, reservedQuantity: { gte: 2 } },
      data: { reservedQuantity: { decrement: 2 } },
    });
    expect(transaction.stockReservation.update).toHaveBeenCalledWith({
      where: { cartId_productSkuId: { cartId: 55n, productSkuId: 101n } },
      data: { status: StockReservationStatus.Committed },
    });
    expect(transaction.stockTransaction.create).toHaveBeenCalledWith({
      data: {
        cartId: 55n,
        productSkuId: 101n,
        type: StockTransactionType.Commit,
        quantity: 2,
      },
    });
  });

  it('treats a repeated commit as a no-op', async () => {
    const { repository, transaction } = setup([
      reservation(101n, StockReservationStatus.Committed),
    ]);

    await repository.commitStock(55n, [{ productSkuId: 101n, quantity: 2 }]);

    expect(transaction.inventoryStock.updateMany).not.toHaveBeenCalled();
    expect(transaction.stockReservation.update).not.toHaveBeenCalled();
    expect(transaction.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('rejects committing a released reservation before changing any item', async () => {
    const { repository, transaction } = setup([
      reservation(101n, StockReservationStatus.Reserved),
      reservation(102n, StockReservationStatus.Released),
    ]);

    await expect(
      repository.commitStock(55n, [
        { productSkuId: 101n, quantity: 2 },
        { productSkuId: 102n, quantity: 2 },
      ]),
    ).rejects.toBeInstanceOf(InvalidStockOperationError);
    expect(transaction.inventoryStock.updateMany).not.toHaveBeenCalled();
  });

  it('rejects releasing a committed reservation', async () => {
    const { repository, transaction } = setup([
      reservation(101n, StockReservationStatus.Committed),
    ]);

    await expect(
      repository.releaseStock(55n, [{ productSkuId: 101n, quantity: 2 }]),
    ).rejects.toBeInstanceOf(InvalidStockOperationError);
    expect(transaction.inventoryStock.updateMany).not.toHaveBeenCalled();
  });
});

function setupInitialization(
  options: {
    markerError?: unknown;
    existingMarker?: object | null;
  } = {},
) {
  const transaction = {
    processedProductEvent: {
      create: options.markerError
        ? vi.fn().mockRejectedValue(options.markerError)
        : vi.fn().mockResolvedValue({}),
    },
    inventoryStock: {
      create: vi.fn(),
    },
    stockTransaction: {
      create: vi.fn(),
    },
  };
  const prisma = {
    processedProductEvent: {
      findUnique: vi.fn().mockResolvedValue(options.existingMarker ?? null),
    },
    $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) =>
      operation(transaction),
    ),
  };

  return {
    repository: new PrismaInventoryRepository(prisma as unknown as PrismaService),
    prisma,
    transaction,
  };
}

function uniqueConstraintError() {
  return { code: 'P2002' };
}

function setup(reservations: ReturnType<typeof reservation>[]) {
  const transaction = {
    $queryRaw: vi.fn(),
    stockReservation: {
      findMany: vi.fn().mockResolvedValue(reservations),
      update: vi.fn(),
    },
    inventoryStock: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    stockTransaction: {
      create: vi.fn(),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) =>
      operation(transaction),
    ),
  };

  return {
    repository: new PrismaInventoryRepository(prisma as unknown as PrismaService),
    transaction,
  };
}

function reservation(productSkuId: bigint, status: StockReservationStatus) {
  return {
    id: productSkuId,
    cartId: 55n,
    productSkuId,
    quantity: 2,
    status,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    releasedAt: status === StockReservationStatus.Released ? new Date() : null,
  };
}
