import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class AddCartItemRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productSkuId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}
