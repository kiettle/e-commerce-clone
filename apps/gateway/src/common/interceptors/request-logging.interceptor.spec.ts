import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestLoggingInterceptor } from './request-logging.interceptor';

describe('RequestLoggingInterceptor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs request metadata without authorization, passwords, or idempotency keys', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const request = {
      method: 'POST',
      originalUrl: '/api/auth/login',
      headers: {
        authorization: 'Bearer signed-jwt',
        'idempotency-key': '550e8400-e29b-41d4-a716-446655440000',
      },
      body: { email: 'customer@example.com', password: 'plain-password' },
    };
    const response = { statusCode: 201 };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    const next = { handle: () => of({ ok: true }) } as CallHandler;

    await lastValueFrom(new RequestLoggingInterceptor().intercept(context, next));

    expect(log).toHaveBeenCalledOnce();
    const message = String(log.mock.calls[0][0]);
    expect(message).toMatch(/^POST \/api\/auth\/login 201 \d+ms$/);
    expect(message).not.toContain('signed-jwt');
    expect(message).not.toContain('plain-password');
    expect(message).not.toContain('550e8400-e29b-41d4-a716-446655440000');
    expect(message).not.toContain('customer@example.com');
  });
});
