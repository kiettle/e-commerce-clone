import {
  Body,
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { CartGatewayClient } from '../../infrastructure/http/cart-gateway.client';
import {
  AddCartItemRequestDto,
  CartResponseDto,
  UpdateCartItemRequestDto,
} from './dto/cart.dto';

@ApiTags('cart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/cart-items')
export class CartItemsGatewayController {
  constructor(private readonly cartClient: CartGatewayClient) {}

  @Post()
  @ApiOperation({ summary: 'Add a SKU to the authenticated user cart' })
  @ApiCreatedResponse({ type: CartResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid cart item request.' })
  @ApiBadGatewayResponse({ description: 'Product snapshot lookup failed.' })
  @ApiNotFoundResponse({ description: 'Product SKU not found.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  addCartItem(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: AddCartItemRequestDto,
  ): Promise<CartResponseDto> {
    return this.cartClient.addCartItem(user.userId, body);
  }

  @Put(':cartItemId')
  @ApiOperation({ summary: 'Update an authenticated user cart item' })
  @ApiParam({ name: 'cartItemId', example: 1, type: Number })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid cart item request.' })
  @ApiNotFoundResponse({ description: 'Cart item not found.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  updateCartItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cartItemId', ParseIntPipe) cartItemId: number,
    @Body() body: UpdateCartItemRequestDto,
  ): Promise<CartResponseDto> {
    return this.cartClient.updateCartItem(user.userId, cartItemId, body);
  }

  @Delete(':cartItemId')
  @ApiOperation({ summary: 'Remove an authenticated user cart item' })
  @ApiParam({ name: 'cartItemId', example: 1, type: Number })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiNotFoundResponse({ description: 'Cart item not found.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  deleteCartItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cartItemId', ParseIntPipe) cartItemId: number,
  ): Promise<CartResponseDto> {
    return this.cartClient.deleteCartItem(user.userId, cartItemId);
  }
}

