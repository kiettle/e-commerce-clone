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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum GatewayProductStatus {
  Active = 'ACTIVE',
  Inactive = 'INACTIVE',
  OutOfStock = 'OUT_OF_STOCK',
  Deleted = 'DELETED',
}

export enum GatewayProductSkuStatus {
  Available = 'AVAILABLE',
  OutOfStock = 'OUT_OF_STOCK',
  Disabled = 'DISABLED',
  Discontinued = 'DISCONTINUED',
}

export class SearchProductsQueryDto {
  @ApiPropertyOptional({ example: 'iPhone' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;
}

export class CreateProductSkuRequestDto {
  @ApiProperty({ example: 'IPH15-BLK-128' })
  @IsString()
  @MinLength(1)
  skuCode!: string;

  @ApiProperty({ example: 799 })
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiProperty({ enum: GatewayProductSkuStatus, example: 'AVAILABLE' })
  @IsEnum(GatewayProductSkuStatus)
  status!: GatewayProductSkuStatus;

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(0)
  quantity!: number;
}

export class CreateProductRequestDto {
  @ApiProperty({ example: 'iPhone 15' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    example: 'Latest iPhone with A17 chip and advanced camera system',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'https://example.com/iphone-15.jpg' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  categoryId!: number;

  @ApiProperty({ example: 6 })
  @IsInt()
  @Min(1)
  sellerId!: number;

  @ApiProperty({ enum: GatewayProductStatus, example: 'ACTIVE' })
  @IsEnum(GatewayProductStatus)
  status!: GatewayProductStatus;

  @ApiProperty({ type: () => [CreateProductSkuRequestDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateProductSkuRequestDto)
  skus!: CreateProductSkuRequestDto[];
}

export class UpdateProductRequestDto {
  @ApiPropertyOptional({ example: 'iPhone 15 Plus' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated product description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'https://example.com/iphone-15-plus.jpg' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @ApiPropertyOptional({ enum: GatewayProductStatus, example: 'ACTIVE' })
  @IsOptional()
  @IsEnum(GatewayProductStatus)
  status?: GatewayProductStatus;
}

export class ProductSkuResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 1 })
  productId!: number;

  @ApiProperty({ example: 'IPH15-BLK-128' })
  skuCode!: string;

  @ApiProperty({ example: 799 })
  price!: number;

  @ApiProperty({ enum: GatewayProductSkuStatus, example: 'AVAILABLE' })
  status!: string;
}

export class ProductResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'iPhone 15' })
  name!: string;

  @ApiPropertyOptional({
    example: 'Latest iPhone with A17 chip and advanced camera system',
  })
  description?: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  imageUrl?: string | null;

  @ApiProperty({ example: 1 })
  categoryId!: number;

  @ApiProperty({ example: 6 })
  sellerId!: number;

  @ApiProperty({ enum: GatewayProductStatus, example: 'ACTIVE' })
  status!: string;

  @ApiProperty({ type: () => [ProductSkuResponseDto] })
  skus!: ProductSkuResponseDto[];
}

