import { ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common';
import { CallHandler } from '@nestjs/common/interfaces';
import { lastValueFrom, of, throwError } from 'rxjs';
import { RequestLoggingInterceptor } from './request-logging.interceptor';

describe('RequestLoggingInterceptor', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs method, URL, status, and duration without sensitive data', async () => {
    const interceptor = new RequestLoggingInterceptor();
    const context = createContext();
    const next: CallHandler = {
      handle: () => of({ ok: true }),
    };

    await lastValueFrom(interceptor.intercept(context, next));

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^POST \/api\/auth\/login 200 \d+ms$/),
    );
    expect(logSpy.mock.calls[0][0]).not.toContain('password123');
    expect(logSpy.mock.calls[0][0]).not.toContain('Bearer token');
  });

  it('logs thrown HTTP error status', async () => {
    const interceptor = new RequestLoggingInterceptor();
    const context = createContext();
    const next: CallHandler = {
      handle: () => throwError(() => new UnauthorizedException()),
    };

    await expect(lastValueFrom(interceptor.intercept(context, next))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^POST \/api\/auth\/login 401 \d+ms$/),
    );
  });
});

function createContext(): ExecutionContext {
  const request = {
    method: 'POST',
    originalUrl: '/api/auth/login',
    headers: {
      authorization: 'Bearer token',
    },
    body: {
      password: 'password123',
    },
  };
  const response = {
    statusCode: 200,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}
