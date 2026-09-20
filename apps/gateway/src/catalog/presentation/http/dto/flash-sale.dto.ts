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
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum GatewayFlashSaleStatus {
  Draft = 'DRAFT',
  Upcoming = 'UPCOMING',
  Active = 'ACTIVE',
  Ended = 'ENDED',
  Cancelled = 'CANCELLED',
}

export enum FlashSaleListStatus {
  Active = 'active',
  Upcoming = 'upcoming',
}

export class ListFlashSalesQueryDto {
  @ApiProperty({ enum: FlashSaleListStatus, example: FlashSaleListStatus.Active })
  @IsEnum(FlashSaleListStatus)
  status!: FlashSaleListStatus;
}

export class FlashSaleItemRequestDto {
  @ApiProperty({ example: 101 })
  @IsInt()
  @Min(1)
  productSkuId!: number;

  @ApiProperty({ example: 79.9, description: 'Price offered during the sale.' })
  @IsNumber()
  @Min(0.01)
  salePrice!: number;

  @ApiProperty({ example: 20 })
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateFlashSaleRequestDto {
  @ApiProperty({ example: 'Weekend keyboard sale' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ example: 'Selected keyboards at a reduced price.', nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({ example: '2026-09-26T01:00:00.000Z', format: 'date-time' })
  @IsISO8601()
  startsAt!: string;

  @ApiProperty({ example: '2026-09-26T03:00:00.000Z', format: 'date-time' })
  @IsISO8601()
  endsAt!: string;

  @ApiProperty({ type: () => [FlashSaleItemRequestDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlashSaleItemRequestDto)
  items!: FlashSaleItemRequestDto[];
}

export class UpdateFlashSaleRequestDto {
  @ApiProperty({ example: 'Updated weekend keyboard sale' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: null, nullable: true })
  @IsDefined()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  description!: string | null;

  @ApiProperty({ example: '2026-09-26T01:00:00.000Z', format: 'date-time' })
  @IsISO8601()
  startsAt!: string;

  @ApiProperty({ example: '2026-09-26T04:00:00.000Z', format: 'date-time' })
  @IsISO8601()
  endsAt!: string;

  @ApiProperty({ type: () => [FlashSaleItemRequestDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlashSaleItemRequestDto)
  items!: FlashSaleItemRequestDto[];
}

export class FlashSaleItemResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 101 })
  productSkuId!: number;

  @ApiProperty({ example: 99.9, description: 'SKU price captured by product-service.' })
  originalPrice!: number;

  @ApiProperty({ example: 79.9 })
  salePrice!: number;

  @ApiProperty({ example: 20 })
  quantity!: number;
}

export class FlashSaleResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Weekend keyboard sale' })
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty({ example: '2026-09-26T01:00:00.000Z', format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ example: '2026-09-26T03:00:00.000Z', format: 'date-time' })
  endsAt!: string;

  @ApiProperty({ enum: GatewayFlashSaleStatus, example: GatewayFlashSaleStatus.Draft })
  status!: GatewayFlashSaleStatus;

  @ApiProperty({ type: () => [FlashSaleItemResponseDto] })
  items!: FlashSaleItemResponseDto[];

  @ApiProperty({ example: '2026-09-20T08:00:00.000Z', format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ example: '2026-09-20T08:00:00.000Z', format: 'date-time' })
  updatedAt!: string;
}

export class PublicFlashSaleItemResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 101 })
  productSkuId!: number;

  @ApiProperty({ example: 99.9 })
  originalPrice!: number;

  @ApiProperty({ example: 79.9 })
  salePrice!: number;
}

export class PublicFlashSaleResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Weekend keyboard sale' })
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty({ example: '2026-09-26T01:00:00.000Z', format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ example: '2026-09-26T03:00:00.000Z', format: 'date-time' })
  endsAt!: string;

  @ApiProperty({ enum: GatewayFlashSaleStatus })
  status!: GatewayFlashSaleStatus;

  @ApiProperty({ type: () => [PublicFlashSaleItemResponseDto] })
  items!: PublicFlashSaleItemResponseDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
