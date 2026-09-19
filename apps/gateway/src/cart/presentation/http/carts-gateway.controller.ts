import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiHeader,
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
  CartResponseDto,
  CheckoutCartResponseDto,
  CheckoutPendingResponseDto,
} from './dto/cart.dto';

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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Checkout the authenticated user cart' })
  @ApiParam({ name: 'cartId', example: 1, type: Number })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'A caller-generated UUID v4 reused for checkout retries.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ type: CheckoutCartResponseDto })
  @ApiAcceptedResponse({ type: CheckoutPendingResponseDto })
  @ApiConflictResponse({ description: 'Checkout key or cart is already in use.' })
  @ApiBadRequestResponse({ description: 'Invalid cart checkout request.' })
  @ApiBadGatewayResponse({ description: 'Checkout dependency failed.' })
  @ApiNotFoundResponse({ description: 'Cart or product snapshot not found.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  async checkoutCart(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cartId', ParseIntPipe) cartId: number,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: { status(code: number): unknown },
  ): Promise<CheckoutCartResponseDto | CheckoutPendingResponseDto> {
    assertValidIdempotencyKey(idempotencyKey);
    const result = await this.cartClient.checkoutCart(
      user.userId,
      cartId,
      idempotencyKey,
    );

    if ('checkoutId' in result) {
      response.status(202);
    }

    return result;
  }
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertValidIdempotencyKey(
  idempotencyKey: string | undefined,
): asserts idempotencyKey is string {
  if (!idempotencyKey || !UUID_V4_PATTERN.test(idempotencyKey)) {
    throw new BadRequestException(
      'Idempotency-Key header must be a valid UUID v4.',
    );
  }
}
