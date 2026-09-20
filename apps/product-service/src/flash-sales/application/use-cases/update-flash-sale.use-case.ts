import { FlashSaleEntity } from '../../domain/entities/flash-sale.entity';
import { FlashSaleStatus } from '../../domain/enums/flash-sale-status.enum';
import { FlashSaleNotDraftError } from '../../domain/errors/flash-sale-not-draft.error';
import { FlashSaleNotFoundError } from '../../domain/errors/flash-sale-not-found.error';
import { FlashSaleRepositoryPort } from '../../domain/repositories/flash-sale.repository.port';
import { UpdateFlashSaleCommand } from '../dto/flash-sale.command';
import { resolveFlashSaleItems } from '../services/resolve-flash-sale-items';

export class UpdateFlashSaleUseCase {
  constructor(private readonly flashSales: FlashSaleRepositoryPort) {}

  async execute(command: UpdateFlashSaleCommand): Promise<FlashSaleEntity> {
    const flashSale = await this.flashSales.findById(command.flashSaleId);
    if (!flashSale) {
      throw new FlashSaleNotFoundError(command.flashSaleId);
    }
    if (flashSale.status !== FlashSaleStatus.Draft) {
      throw new FlashSaleNotDraftError();
    }

    const items = await resolveFlashSaleItems(command.items, this.flashSales);
    flashSale.update({
      name: command.name,
      description: command.description,
      startsAt: command.startsAt,
      endsAt: command.endsAt,
      items,
    });

    return this.flashSales.replaceDraft(flashSale);
  }
}
