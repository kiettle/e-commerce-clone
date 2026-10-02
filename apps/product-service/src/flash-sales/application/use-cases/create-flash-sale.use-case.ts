import { FlashSaleEntity } from '../../domain/entities/flash-sale.entity';
import { FlashSaleRepositoryPort } from '../../domain/repositories/flash-sale.repository.port';
import { CreateFlashSaleCommand } from '../dto/flash-sale.command';
import { resolveFlashSaleItems } from '../services/resolve-flash-sale-items';

export class CreateFlashSaleUseCase {
  constructor(private readonly flashSales: FlashSaleRepositoryPort) {}

  async execute(command: CreateFlashSaleCommand): Promise<FlashSaleEntity> {
    const items = await resolveFlashSaleItems(command.items, this.flashSales);
    const flashSale = new FlashSaleEntity({
      name: command.name,
      description: command.description,
      startsAt: command.startsAt,
      endsAt: command.endsAt,
      createdBy: command.createdBy,
      items,
    });

    return this.flashSales.create(flashSale);
  }
}
