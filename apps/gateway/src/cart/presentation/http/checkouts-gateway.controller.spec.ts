import { describe, expect, it, vi, type Mocked } from 'vitest';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { CartGatewayClient } from '../../infrastructure/http/cart-gateway.client';
import { GatewayCheckoutStatus } from './dto/cart.dto';
import { CheckoutsGatewayController } from './checkouts-gateway.controller';

describe('CheckoutsGatewayController', () => {
  it('forwards checkout status lookup without adding business logic', async () => {
    const checkoutId = '018f47a1-7b72-4c7f-8c52-f06612de3377';
    const user = { userId: 10 } as AuthenticatedUser;
    const response = {
      checkoutId,
      status: GatewayCheckoutStatus.Completed,
      orderId: 501,
    };
    const client = {
      getCheckoutStatus: vi.fn().mockResolvedValue(response),
    } as unknown as Mocked<CartGatewayClient>;
    const controller = new CheckoutsGatewayController(client);

    await expect(
      controller.getCheckoutStatus(user, checkoutId),
    ).resolves.toBe(response);
    expect(client.getCheckoutStatus).toHaveBeenCalledWith(10, checkoutId);
  });
});
