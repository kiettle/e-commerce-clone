import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { FlashSaleItemEntity } from '../../domain/entities/flash-sale-item.entity';
import { FlashSaleEntity } from '../../domain/entities/flash-sale.entity';
import { FlashSaleStatus } from '../../domain/enums/flash-sale-status.enum';
import { FlashSaleNotDraftError } from '../../domain/errors/flash-sale-not-draft.error';
import { FlashSaleSkuInactiveError } from '../../domain/errors/flash-sale-sku-inactive.error';
import { FlashSaleSkuNotFoundError } from '../../domain/errors/flash-sale-sku-not-found.error';
import { InvalidFlashSaleError } from '../../domain/errors/invalid-flash-sale.error';
import { FlashSaleRepositoryPort } from '../../domain/repositories/flash-sale.repository.port';
import { CancelFlashSaleUseCase } from './cancel-flash-sale.use-case';
import { CreateFlashSaleUseCase } from './create-flash-sale.use-case';
import { UpdateFlashSaleUseCase } from './update-flash-sale.use-case';

const startsAt = new Date('2026-09-25T10:00:00.000Z');
const endsAt = new Date('2026-09-25T12:00:00.000Z');

describe('flash-sale draft use cases', () => {
  let flashSales: Mocked<FlashSaleRepositoryPort>;

  beforeEach(() => {
    flashSales = {
      findSkusByIds: vi.fn().mockResolvedValue([
        { id: 10n, price: 99.9, active: true },
        { id: 11n, price: 149.9, active: true },
      ]),
      create: vi.fn().mockImplementation(async (flashSale) => flashSale),
      findById: vi.fn().mockResolvedValue(draftSale()),
      findByEffectiveStatus: vi.fn(),
      replaceDraft: vi.fn().mockImplementation(async (flashSale) => flashSale),
      cancelDraft: vi.fn().mockResolvedValue(cancelledSale()),
      scheduleDraft: vi.fn(),
    };
  });

  it('loads referenced SKUs once and captures their current prices when creating', async () => {
    const useCase = new CreateFlashSaleUseCase(flashSales);

    await useCase.execute(command());

    expect(flashSales.findSkusByIds).toHaveBeenCalledOnce();
    expect(flashSales.findSkusByIds).toHaveBeenCalledWith([10n, 11n]);
    const saved = flashSales.create.mock.calls[0][0];
    expect(saved.items.map((item) => item.originalPrice)).toEqual([99.9, 149.9]);
  });

  it('rejects a missing SKU without creating any sale', async () => {
    flashSales.findSkusByIds.mockResolvedValue([{ id: 10n, price: 99.9, active: true }]);
    const useCase = new CreateFlashSaleUseCase(flashSales);

    await expect(useCase.execute(command())).rejects.toBeInstanceOf(FlashSaleSkuNotFoundError);
    expect(flashSales.create).not.toHaveBeenCalled();
  });

  it('rejects an inactive SKU without creating any sale', async () => {
    flashSales.findSkusByIds.mockResolvedValue([
      { id: 10n, price: 99.9, active: false },
      { id: 11n, price: 149.9, active: true },
    ]);
    const useCase = new CreateFlashSaleUseCase(flashSales);

    await expect(useCase.execute(command())).rejects.toBeInstanceOf(FlashSaleSkuInactiveError);
    expect(flashSales.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate SKU IDs before accessing persistence', async () => {
    const useCase = new CreateFlashSaleUseCase(flashSales);
    const duplicate = command();
    duplicate.items[1].productSkuId = 10n;

    await expect(useCase.execute(duplicate)).rejects.toBeInstanceOf(InvalidFlashSaleError);
    expect(flashSales.findSkusByIds).not.toHaveBeenCalled();
    expect(flashSales.create).not.toHaveBeenCalled();
  });

  it('fully replaces a draft and re-reads current prices', async () => {
    flashSales.findSkusByIds.mockResolvedValue([{ id: 11n, price: 159.9, active: true }]);
    const useCase = new UpdateFlashSaleUseCase(flashSales);

    await useCase.execute({
      flashSaleId: 1n,
      name: 'Replacement',
      description: null,
      startsAt,
      endsAt,
      items: [{ productSkuId: 11n, salePrice: 120, quantity: 4 }],
    });

    const replacement = flashSales.replaceDraft.mock.calls[0][0];
    expect(replacement.name).toBe('Replacement');
    expect(replacement.description).toBeNull();
    expect(replacement.items).toHaveLength(1);
    expect(replacement.items[0]).toMatchObject({
      productSkuId: 11n,
      originalPrice: 159.9,
      salePrice: 120,
      quantity: 4,
    });
  });

  it.each([FlashSaleStatus.Scheduled, FlashSaleStatus.Cancelled])(
    'rejects updating a %s sale before loading SKUs',
    async (status) => {
      flashSales.findById.mockResolvedValue(draftSale(status));
      const useCase = new UpdateFlashSaleUseCase(flashSales);

      await expect(
        useCase.execute({
          flashSaleId: 1n,
          name: 'Replacement',
          description: null,
          startsAt,
          endsAt,
          items: [],
        }),
      ).rejects.toBeInstanceOf(FlashSaleNotDraftError);
      expect(flashSales.findSkusByIds).not.toHaveBeenCalled();
      expect(flashSales.replaceDraft).not.toHaveBeenCalled();
    },
  );

  it('cancels a draft without deleting it', async () => {
    const useCase = new CancelFlashSaleUseCase(flashSales);

    const result = await useCase.execute(1n);

    expect(flashSales.cancelDraft).toHaveBeenCalledWith(1n);
    expect(result.status).toBe(FlashSaleStatus.Cancelled);
  });

  it('rejects cancelling a scheduled sale', async () => {
    flashSales.findById.mockResolvedValue(draftSale(FlashSaleStatus.Scheduled));
    const useCase = new CancelFlashSaleUseCase(flashSales);

    await expect(useCase.execute(1n)).rejects.toBeInstanceOf(FlashSaleNotDraftError);
    expect(flashSales.cancelDraft).not.toHaveBeenCalled();
  });
});

function command() {
  return {
    name: 'Weekend sale',
    description: 'Keyboards',
    startsAt,
    endsAt,
    items: [
      { productSkuId: 10n, salePrice: 79.9, quantity: 5 },
      { productSkuId: 11n, salePrice: 119.9, quantity: 3 },
    ],
  };
}

function draftSale(status = FlashSaleStatus.Draft): FlashSaleEntity {
  return new FlashSaleEntity({
    id: 1n,
    name: 'Weekend sale',
    description: 'Keyboards',
    startsAt,
    endsAt,
    status,
    items: [
      new FlashSaleItemEntity({
        id: 1n,
        flashSaleId: 1n,
        productSkuId: 10n,
        originalPrice: 99.9,
        salePrice: 79.9,
        quantity: 5,
      }),
    ],
  });
}

function cancelledSale(): FlashSaleEntity {
  return draftSale(FlashSaleStatus.Cancelled);
}
