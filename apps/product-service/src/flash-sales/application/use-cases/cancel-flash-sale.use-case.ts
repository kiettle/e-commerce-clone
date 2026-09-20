import { FlashSaleEntity } from '../../domain/entities/flash-sale.entity';
import { FlashSaleNotFoundError } from '../../domain/errors/flash-sale-not-found.error';
import { FlashSaleRepositoryPort } from '../../domain/repositories/flash-sale.repository.port';

export class CancelFlashSaleUseCase {
  constructor(private readonly flashSales: FlashSaleRepositoryPort) {}

  async execute(flashSaleId: bigint): Promise<FlashSaleEntity> {
    const flashSale = await this.flashSales.findById(flashSaleId);
    if (!flashSale) {
      throw new FlashSaleNotFoundError(flashSaleId);
    }

    flashSale.cancel();
    return this.flashSales.cancelDraft(flashSaleId);
  }
}
