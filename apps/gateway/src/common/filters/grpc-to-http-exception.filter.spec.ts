import { ArgumentsHost, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GrpcToHttpExceptionFilter } from './grpc-to-http-exception.filter';

describe('GrpcToHttpExceptionFilter', () => {
  it('preserves a structured downstream error code', () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;

    new GrpcToHttpExceptionFilter().catch(
      new ConflictException({
        code: 'FLASH_SALE_SOLD_OUT',
        message: 'Flash-sale allocation is sold out.',
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      code: 'FLASH_SALE_SOLD_OUT',
      message: 'Flash-sale allocation is sold out.',
      statusCode: 409,
      error: 'CONFLICT',
    });
  });
});
