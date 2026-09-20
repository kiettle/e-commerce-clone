import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { InvalidStockOperationError } from '../../domain/errors/invalid-stock-operation.error';
import { InventoryRepositoryPort } from '../../domain/repositories/inventory.repository.port';
import { HandleProductCreatedCommand } from '../dto/handle-product-created.command';
import { HandleProductCreatedUseCase } from './handle-product-created.use-case';

describe('HandleProductCreatedUseCase', () => {
  const command: HandleProductCreatedCommand = {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
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

  let inventory: Mocked<InventoryRepositoryPort>;
  let useCase: HandleProductCreatedUseCase;

  beforeEach(() => {
    inventory = {
      initializeFromProductCreated: vi.fn(),
      reserveStock: vi.fn(),
      commitStock: vi.fn(),
      releaseStock: vi.fn(),
    };
    useCase = new HandleProductCreatedUseCase(inventory);
  });

  it('rejects an empty event ID', async () => {
    await expect(
      useCase.execute({ ...command, eventId: '  ' }),
    ).rejects.toBeInstanceOf(InvalidStockOperationError);
    expect(inventory.initializeFromProductCreated).not.toHaveBeenCalled();
  });

  it('rejects negative quantities before initialization', async () => {
    await expect(
      useCase.execute({
        ...command,
        skus: [{ ...command.skus[0], quantity: -1 }],
      }),
    ).rejects.toBeInstanceOf(InvalidStockOperationError);
    expect(inventory.initializeFromProductCreated).not.toHaveBeenCalled();
  });

  it('passes every valid SKU to inventory initialization', async () => {
    await useCase.execute(command);

    expect(inventory.initializeFromProductCreated).toHaveBeenCalledOnce();
    expect(inventory.initializeFromProductCreated).toHaveBeenCalledWith(command);
  });
});
