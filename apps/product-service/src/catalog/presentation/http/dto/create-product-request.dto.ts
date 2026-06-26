import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ProductSkuStatus } from '../../../domain/enums/product-sku-status.enum';
import { ProductStatus } from '../../../domain/enums/product-status.enum';

export class CreateProductSkuRequestDto {
  @IsString()
  @MinLength(1)
  skuCode!: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsEnum(ProductSkuStatus)
  status!: ProductSkuStatus;

  @IsInt()
  @Min(0)
  quantity!: number;
}

export class CreateProductRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsInt()
  @Min(1)
  categoryId!: number;

  @IsInt()
  @Min(1)
  sellerId!: number;

  @IsEnum(ProductStatus)
  status!: ProductStatus;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateProductSkuRequestDto)
  skus!: CreateProductSkuRequestDto[];
}
