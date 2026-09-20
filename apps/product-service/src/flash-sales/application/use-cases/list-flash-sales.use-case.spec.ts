import { describe, expect, it, vi } from 'vitest';
import { FlashSaleStatus } from '../../domain/enums/flash-sale-status.enum';
import { FlashSaleRepositoryPort } from '../../domain/repositories/flash-sale.repository.port';
import { ListFlashSalesUseCase } from './list-flash-sales.use-case';

describe('ListFlashSalesUseCase', () => {
  it('uses one clock value for filtering and response status evaluation', async () => {
    const now = new Date('2026-09-25T10:00:00.000Z');
    const repository = {
      findByEffectiveStatus: vi.fn().mockResolvedValue([]),
    } as unknown as FlashSaleRepositoryPort;
    const useCase = new ListFlashSalesUseCase(repository, { now: () => now });

    await expect(useCase.execute(FlashSaleStatus.Active)).resolves.toEqual({
      flashSales: [],
      evaluatedAt: now,
    });
    expect(repository.findByEffectiveStatus).toHaveBeenCalledWith(FlashSaleStatus.Active, now);
  });
});
