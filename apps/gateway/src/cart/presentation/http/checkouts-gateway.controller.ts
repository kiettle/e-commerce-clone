import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { CartGatewayClient } from '../../infrastructure/grpc/cart-gateway.client';
import { CheckoutStatusResponseDto } from './dto/cart.dto';

@ApiTags('checkout')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/checkouts')
export class CheckoutsGatewayController {
  constructor(private readonly cartClient: CartGatewayClient) {}

  @Get(':checkoutId')
  @ApiOperation({ summary: 'Get checkout status' })
  @ApiParam({
    name: 'checkoutId',
    description: 'The durable checkout attempt UUID.',
    example: '018f47a1-7b72-4c7f-8c52-f06612de3377',
  })
  @ApiOkResponse({ type: CheckoutStatusResponseDto })
  @ApiBadRequestResponse({ description: 'Malformed checkout ID.' })
  @ApiNotFoundResponse({ description: 'Checkout not found.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  getCheckoutStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('checkoutId', new ParseUUIDPipe({ version: '4' }))
    checkoutId: string,
  ): Promise<CheckoutStatusResponseDto> {
    return this.cartClient.getCheckoutStatus(user.userId, checkoutId);
  }
}
