import {
  Body,
  Controller,
  Delete,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { AddCartItemUseCase } from '../../application/use-cases/add-cart-item.use-case';
import { DeleteCartItemUseCase } from '../../application/use-cases/delete-cart-item.use-case';
import { UpdateCartItemUseCase } from '../../application/use-cases/update-cart-item.use-case';
import { CartResponse, toCartResponse } from './cart-response.mapper';
import { mapCartError } from './carts.controller';
import { AddCartItemRequestDto } from './dto/add-cart-item-request.dto';
import { UpdateCartItemRequestDto } from './dto/update-cart-item-request.dto';
import { parseUserIdHeader } from './user-id-header';

@Controller('api/cart-items')
export class CartItemsController {
  constructor(
    private readonly addCartItemUseCase: AddCartItemUseCase,
    private readonly updateCartItemUseCase: UpdateCartItemUseCase,
    private readonly deleteCartItemUseCase: DeleteCartItemUseCase,
  ) {}

  @Post()
  async addCartItem(
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Body() body: AddCartItemRequestDto,
  ): Promise<CartResponse> {
    try {
      const cart = await this.addCartItemUseCase.execute({
        userId: parseUserIdHeader(userIdHeader),
        productSkuId: BigInt(body.productSkuId),
        quantity: body.quantity,
      });

      return toCartResponse(cart);
    } catch (error) {
      throw mapCartError(error);
    }
  }

  @Put(':cartItemId')
  async updateCartItem(
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Param('cartItemId', ParseIntPipe) cartItemId: number,
    @Body() body: UpdateCartItemRequestDto,
  ): Promise<CartResponse> {
    try {
      const cart = await this.updateCartItemUseCase.execute({
        userId: parseUserIdHeader(userIdHeader),
        cartItemId: BigInt(cartItemId),
        quantity: body.quantity,
      });

      return toCartResponse(cart);
    } catch (error) {
      throw mapCartError(error);
    }
  }

  @Delete(':cartItemId')
  async deleteCartItem(
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Param('cartItemId', ParseIntPipe) cartItemId: number,
  ): Promise<CartResponse> {
    try {
      const cart = await this.deleteCartItemUseCase.execute({
        userId: parseUserIdHeader(userIdHeader),
        cartItemId: BigInt(cartItemId),
      });

      return toCartResponse(cart);
    } catch (error) {
      throw mapCartError(error);
    }
  }
}
