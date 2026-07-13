import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UpdateCartItemRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;
}
