import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { InvalidStockOperationError } from '../../domain/errors/invalid-stock-operation.error';
import { InventoryRepositoryPort } from '../../domain/repositories/inventory.repository.port';
import { HandleProductCreatedCommand } from '../dto/handle-product-created.command';
import { calculateProductCreatedPayloadHash } from '../services/product-created-payload-hash';
import { HandleProductCreatedUseCase } from './handle-product-created.use-case';

describe('HandleProductCreatedUseCase', () => {
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

  it.each([
    ['missing event ID', { eventId: '' }],
    ['malformed event ID', { eventId: 'not-a-uuid' }],
    ['unsupported schema version', { schemaVersion: 2 }],
    ['non-positive product ID', { productId: 0n }],
    ['empty SKU list', { skus: [] }],
    ['non-positive SKU ID', { skus: [{ ...validCommand().skus[0], productSkuId: 0n }] }],
    ['blank SKU code', { skus: [{ ...validCommand().skus[0], skuCode: '  ' }] }],
    ['negative quantity', { skus: [{ ...validCommand().skus[0], quantity: -1 }] }],
  ])('rejects %s', async (_name, change) => {
    await expect(useCase.execute({ ...validCommand(), ...change })).rejects.toBeInstanceOf(
      InvalidStockOperationError,
    );
    expect(inventory.initializeFromProductCreated).not.toHaveBeenCalled();
  });

  it('rejects duplicate SKU IDs', async () => {
    const command = validCommand();

    await expect(
      useCase.execute({
        ...command,
        skus: [command.skus[0], { ...command.skus[1], productSkuId: command.skus[0].productSkuId }],
      }),
    ).rejects.toBeInstanceOf(InvalidStockOperationError);
    expect(inventory.initializeFromProductCreated).not.toHaveBeenCalled();
  });

  it('rejects duplicate SKU codes', async () => {
    const command = validCommand();

    await expect(
      useCase.execute({
        ...command,
        skus: [command.skus[0], { ...command.skus[1], skuCode: command.skus[0].skuCode }],
      }),
    ).rejects.toBeInstanceOf(InvalidStockOperationError);
    expect(inventory.initializeFromProductCreated).not.toHaveBeenCalled();
  });

  it('passes validated data and its canonical hash to inventory initialization', async () => {
    const command = validCommand();

    await useCase.execute(command);

    expect(inventory.initializeFromProductCreated).toHaveBeenCalledOnce();
    expect(inventory.initializeFromProductCreated).toHaveBeenCalledWith({
      ...command,
      payloadHash: calculateProductCreatedPayloadHash(command),
    });
  });
});

function validCommand(): HandleProductCreatedCommand {
  return {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    schemaVersion: 1,
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
}
