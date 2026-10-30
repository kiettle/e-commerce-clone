import { BadRequestException } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { CartGatewayClient } from '../../infrastructure/grpc/cart-gateway.client';
import { CartsGatewayController } from './carts-gateway.controller';

describe('CartsGatewayController checkout', () => {
  const user = { userId: 10 } as AuthenticatedUser;
  const key = '550E8400-E29B-41D4-A716-446655440000';
  let client: Mocked<CartGatewayClient>;
  let response: { status: ReturnType<typeof vi.fn> };
  let controller: CartsGatewayController;

  beforeEach(() => {
    client = {
      getActiveCart: vi.fn(),
      checkoutCart: vi.fn(),
    } as unknown as Mocked<CartGatewayClient>;
    response = { status: vi.fn() };
    controller = new CartsGatewayController(client);
  });

  it('declares successful checkout as HTTP 200', () => {
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, CartsGatewayController.prototype.checkoutCart),
    ).toBe(200);
  });

  it('forwards a valid caller-provided key unchanged', async () => {
    client.checkoutCart.mockResolvedValue({
      checkoutId: '018f47a1-7b72-4c7f-8c52-f06612de3377',
      status: 'COMPLETED',
      orderId: 501,
      cart: {
        id: 20,
        userId: 10,
        status: 'CHECKED_OUT',
        items: [],
        totalAmount: 0,
      },
    });

    await controller.checkoutCart(user, 20, key, response);

    expect(client.checkoutCart).toHaveBeenCalledWith(10, 20, key);
    expect(response.status).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'not-a-uuid', '550e8400-e29b-11d4-a716-446655440000'])(
    'rejects a missing or invalid key: %s',
    async (invalidKey) => {
      await expect(controller.checkoutCart(user, 20, invalidKey, response)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(client.checkoutCart).not.toHaveBeenCalled();
    },
  );

  it('returns 202 when checkout needs reconciliation', async () => {
    client.checkoutCart.mockResolvedValue({
      checkoutId: '018f47a1-7b72-4c7f-8c52-f06612de3377',
      status: 'RECONCILIATION_REQUIRED',
    });

    await controller.checkoutCart(user, 20, key, response);

    expect(response.status).toHaveBeenCalledWith(202);
  });
});
