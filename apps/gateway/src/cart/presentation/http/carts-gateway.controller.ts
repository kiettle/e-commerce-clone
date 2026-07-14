import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
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
import { CartResponseDto, CheckoutCartResponseDto } from './dto/cart.dto';

@ApiTags('cart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/carts')
export class CartsGatewayController {
  constructor(private readonly cartClient: CartGatewayClient) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user active cart' })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  getActiveCart(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CartResponseDto> {
    return this.cartClient.getActiveCart(user.userId);
  }

  @Post(':cartId/checkout')
  @ApiOperation({ summary: 'Checkout the authenticated user cart' })
  @ApiParam({ name: 'cartId', example: 1, type: Number })
  @ApiCreatedResponse({ type: CheckoutCartResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid cart checkout request.' })
  @ApiBadGatewayResponse({ description: 'Checkout dependency failed.' })
  @ApiNotFoundResponse({ description: 'Cart or product snapshot not found.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  checkoutCart(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cartId', ParseIntPipe) cartId: number,
  ): Promise<CheckoutCartResponseDto> {
    return this.cartClient.checkoutCart(user.userId, cartId);
  }
}
