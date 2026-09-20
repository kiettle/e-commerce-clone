import { describe, expect, it, vi } from 'vitest';
import { StockReservationStatus } from '../../../domain/enums/stock-reservation-status.enum';
import { StockTransactionType } from '../../../domain/enums/stock-transaction-type.enum';
import { InvalidStockOperationError } from '../../../domain/errors/invalid-stock-operation.error';
import { PrismaInventoryRepository } from './inventory.prisma.repository';
import { PrismaService } from './prisma.service';

describe('PrismaInventoryRepository reservation completion', () => {
  it('commits a reservation without restoring available quantity', async () => {
    const { repository, transaction } = setup([
      reservation(101n, StockReservationStatus.Reserved),
    ]);

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
    $transaction: vi.fn(
      async (operation: (client: typeof transaction) => unknown) =>
        operation(transaction),
    ),
  };

  return {
    repository: new PrismaInventoryRepository(
      prisma as unknown as PrismaService,
    ),
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
