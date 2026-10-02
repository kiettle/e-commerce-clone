import { describe, expect, it, vi } from 'vitest';
import { FlashSaleRepositoryPort } from '../../domain/repositories/flash-sale.repository.port';
import { ScheduleFlashSaleUseCase } from './schedule-flash-sale.use-case';

describe('ScheduleFlashSaleUseCase', () => {
  it('passes one stable event identity and occurrence time into the transaction', async () => {
    const occurredAt = new Date('2026-09-20T08:00:00.000Z');
    const flashSales = {
      findSkusByIds: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      findByEffectiveStatus: vi.fn(),
      replaceDraft: vi.fn(),
      cancelDraft: vi.fn(),
      scheduleDraft: vi.fn().mockResolvedValue({}),
    } as unknown as FlashSaleRepositoryPort;
    const useCase = new ScheduleFlashSaleUseCase(
      flashSales,
      { now: () => occurredAt },
      () => '550e8400-e29b-41d4-a716-446655440000',
    );

    await useCase.execute(10n);

    expect(flashSales.scheduleDraft).toHaveBeenCalledWith({
      flashSaleId: 10n,
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      occurredAt,
    });
  });
});
