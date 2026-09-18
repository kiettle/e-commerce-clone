import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum GatewayCartStatus {
  Active = 'ACTIVE',
  CheckedOut = 'CHECKED_OUT',
  Abandoned = 'ABANDONED',
}

export class AddCartItemRequestDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productSkuId!: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class UpdateCartItemRequestDto {
  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;
}

export class CartItemResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 1 })
  cartId!: number;

  @ApiProperty({ example: 1 })
  productId!: number;

  @ApiProperty({ example: 'iPhone 15' })
  productName!: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  imageUrl?: string | null;

  @ApiProperty({ example: 1 })
  productSkuId!: number;

  @ApiProperty({ example: 'IPH15-BLK-128' })
  skuCode!: string;

  @ApiProperty({ example: 799 })
  price!: number;

  @ApiProperty({ example: 1 })
  quantity!: number;

  @ApiProperty({ example: 799 })
  subtotal!: number;
}

export class CartResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 1 })
  userId!: number;

  @ApiProperty({ enum: GatewayCartStatus, example: 'ACTIVE' })
  status!: string;

  @ApiProperty({ example: 799 })
  totalAmount!: number;

  @ApiProperty({ type: () => [CartItemResponseDto] })
  items!: CartItemResponseDto[];
}

export class CheckoutCartResponseDto {
  @ApiProperty({ example: 1 })
  orderId!: number;

  @ApiProperty({ type: () => CartResponseDto })
  cart!: CartResponseDto;
}

export class CheckoutPendingResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  checkoutId!: string;

  @ApiProperty({ example: 'RECONCILIATION_REQUIRED' })
  status!: string;
}
