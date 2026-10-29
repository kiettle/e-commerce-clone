import { BadGatewayException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createServer, type RequestListener, type Server } from 'node:http';
import { Socket, type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DownstreamHttpClient } from '../../apps/gateway/src/common/http/downstream-http.client';

describe('gateway downstream HTTP transport', () => {
  let server: Server;
  const clients: DownstreamHttpClient[] = [];
  function createClient(connections = 64) {
    const client = new DownstreamHttpClient(
      new ConfigService({ GATEWAY_HTTP_MAX_CONNECTIONS: connections }),
    );
    clients.push(client);
    return client;
  }

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await Promise.all(clients.splice(0).map((client) => client.onModuleDestroy()));
  });

  async function listen(handler: RequestListener) {
    server = createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it('forwards concurrent checkout calls using the patched client when socket QoS is unsupported', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Socket.prototype, 'setTypeOfService');
    const unsupportedQos = vi.fn(() => {
      throw Object.assign(new Error('setTypeOfService EINVAL'), { code: 'EINVAL' });
    });
    Object.defineProperty(Socket.prototype, 'setTypeOfService', {
      configurable: true,
      value: unsupportedQos,
    });
    // Prove forwarding does not fall back to Node's affected bundled fetch.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('Bundled fetch must not be used');
      }),
    );
    const keys: string[] = [];
    try {
      const baseUrl = await listen((request, response) => {
        keys.push(String(request.headers['idempotency-key']));
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ status: 'COMPLETED', orderId: 42 }));
      });
      const client = createClient();
      const responses = await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          client.request({
            serviceName: 'cart',
            baseUrl,
            path: `/api/carts/${index}/checkout`,
            method: 'POST',
            headers: { 'Idempotency-Key': `key-${index}` },
          }),
        ),
      );
      expect(responses).toEqual(
        Array.from({ length: 20 }, () => ({ status: 'COMPLETED', orderId: 42 })),
      );
      expect(new Set(keys).size).toBe(20);
      expect(unsupportedQos).not.toHaveBeenCalled();
    } finally {
      if (descriptor) Object.defineProperty(Socket.prototype, 'setTypeOfService', descriptor);
      else Reflect.deleteProperty(Socket.prototype, 'setTypeOfService');
    }
  });

  it('queues requests above the configured connection limit without losing or replaying them', async () => {
    let active = 0;
    let peak = 0;
    let calls = 0;
    const baseUrl = await listen((_request, response) => {
      active += 1;
      calls += 1;
      peak = Math.max(peak, active);
      setTimeout(() => {
        active -= 1;
        response.end('{}');
      }, 10);
    });
    const client = createClient(2);
    await Promise.all(
      Array.from({ length: 12 }, () =>
        client.request({
          serviceName: 'cart',
          baseUrl,
          path: '/checkout',
          method: 'POST',
        }),
      ),
    );
    expect(peak).toBe(2);
    expect(calls).toBe(12);
  });

  it('preserves a sold-out response and does not retry a checkout POST', async () => {
    let calls = 0;
    const baseUrl = await listen((_request, response) => {
      calls += 1;
      response.writeHead(409, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ code: 'FLASH_SALE_SOLD_OUT' }));
    });
    const error = await createClient()
      .request({
        serviceName: 'cart',
        baseUrl,
        path: '/checkout',
        method: 'POST',
      })
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(409);
    expect((error as HttpException).getResponse()).toEqual({ code: 'FLASH_SALE_SOLD_OUT' });
    expect(calls).toBe(1);
  });

  it('maps a dropped connection to a gateway error without retrying checkout', async () => {
    let calls = 0;
    const baseUrl = await listen((request) => {
      calls += 1;
      request.socket.destroy();
    });
    await expect(
      createClient().request({
        serviceName: 'cart',
        baseUrl,
        path: '/checkout',
        method: 'POST',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(calls).toBe(1);
  });
});
