import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCategoryRequestDto {
  @ApiProperty({ example: 'Smartphones' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: 'smartphones' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;
}

export class CategoryResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Smartphones' })
  name!: string;

  @ApiProperty({ example: 'smartphones' })
  slug!: string;
}

