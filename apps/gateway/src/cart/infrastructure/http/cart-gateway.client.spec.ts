import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { DownstreamHttpClient } from '../../../common/http/downstream-http.client';
import { CartGatewayClient } from './cart-gateway.client';

describe('CartGatewayClient checkout', () => {
  const key = '550E8400-E29B-41D4-A716-446655440000';
  let httpClient: Mocked<DownstreamHttpClient>;
  let client: CartGatewayClient;

  beforeEach(() => {
    const config = {
      get: vi.fn().mockReturnValue('http://cart-service:4002'),
    } as unknown as ConfigService;
    httpClient = {
      request: vi.fn().mockResolvedValue({ orderId: 501 }),
    } as unknown as Mocked<DownstreamHttpClient>;
    client = new CartGatewayClient(config, httpClient);
  });

  it('forwards the idempotency key without normalizing or replacing it', async () => {
    await client.checkoutCart(10, 20, key);

    expect(httpClient.request).toHaveBeenCalledWith({
      serviceName: 'cart-service',
      baseUrl: 'http://cart-service:4002',
      path: '/api/carts/20/checkout',
      method: 'POST',
      headers: {
        'x-user-id': '10',
        'Idempotency-Key': key,
      },
    });
  });
});
