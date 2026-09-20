import { Transform } from 'class-transformer';
import { IsEnum } from 'class-validator';

export enum FlashSaleListStatus {
  Active = 'active',
  Upcoming = 'upcoming',
}

export class ListFlashSalesQueryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsEnum(FlashSaleListStatus)
  status!: FlashSaleListStatus;
}
