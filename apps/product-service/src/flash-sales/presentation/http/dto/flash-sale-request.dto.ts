import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class FlashSaleItemRequestDto {
  @IsInt()
  @Min(1)
  productSkuId!: number;

  @IsNumber()
  @Min(0.01)
  salePrice!: number;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateFlashSaleRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlashSaleItemRequestDto)
  items!: FlashSaleItemRequestDto[];
}

export class UpdateFlashSaleRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsDefined()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  description!: string | null;

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlashSaleItemRequestDto)
  items!: FlashSaleItemRequestDto[];
}
