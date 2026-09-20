import { FlashSaleEntity } from '../entities/flash-sale.entity';

export const FLASH_SALE_REPOSITORY = Symbol('FLASH_SALE_REPOSITORY');

export interface FlashSaleRepositoryPort {
  create(flashSale: FlashSaleEntity): Promise<FlashSaleEntity>;
  findById(flashSaleId: bigint): Promise<FlashSaleEntity | null>;
  save(flashSale: FlashSaleEntity): Promise<FlashSaleEntity>;
}
