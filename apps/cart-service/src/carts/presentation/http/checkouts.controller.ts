import { Controller, Get, Headers, Param } from '@nestjs/common';
import { GetCheckoutStatusUseCase } from '../../application/use-cases/get-checkout-status.use-case';
import {
  CheckoutStatusResponse,
  toCheckoutStatusResponse,
} from './cart-response.mapper';
import { mapCartError } from './carts.controller';
import { parseUserIdHeader } from './user-id-header';

@Controller('api/checkouts')
export class CheckoutsController {
  constructor(
    private readonly getCheckoutStatusUseCase: GetCheckoutStatusUseCase,
  ) {}

  @Get(':checkoutId')
  async getCheckoutStatus(
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Param('checkoutId') checkoutId: string,
  ): Promise<CheckoutStatusResponse> {
    try {
      const attempt = await this.getCheckoutStatusUseCase.execute(
        parseUserIdHeader(userIdHeader),
        checkoutId,
      );

      return toCheckoutStatusResponse(attempt);
    } catch (error) {
      throw mapCartError(error);
    }
  }
}
