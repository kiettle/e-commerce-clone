import { describe, it, expect } from 'vitest';
import { status } from '@grpc/grpc-js';
import { ConflictException } from '@nestjs/common';
import { grpcHttpError } from './grpc-http-error';
describe('gRPC HTTP translation', () => {
  it.each([
    [status.INVALID_ARGUMENT, 400],
    [status.UNAUTHENTICATED, 401],
    [status.PERMISSION_DENIED, 403],
    [status.NOT_FOUND, 404],
    [status.FAILED_PRECONDITION, 409],
    [status.ALREADY_EXISTS, 409],
    [status.UNAVAILABLE, 503],
    [status.DEADLINE_EXCEEDED, 504],
    [status.INTERNAL, 500],
    [status.UNKNOWN, 502],
  ])('maps gRPC status %i to HTTP %i', (code, http) =>
    expect(grpcHttpError({ code }, 'Cart service').getStatus()).toBe(http),
  );
  it('preserves public business codes but not arbitrary error fields', () => {
    const error = grpcHttpError(
      {
        code: status.FAILED_PRECONDITION,
        details: JSON.stringify({
          code: 'FLASH_SALE_SOLD_OUT',
          message: 'Sold out.',
          secret: 'hidden',
        }),
      },
      'Cart service',
    );
    expect(error.getResponse()).toMatchObject({
      code: 'FLASH_SALE_SOLD_OUT',
      message: 'Sold out.',
    });
    expect(error.getResponse()).not.toHaveProperty('secret');
    const existing = new ConflictException('Conflict');
    expect(grpcHttpError(existing, 'Cart service')).toBe(existing);
  });
  it('does not expose internal errors', () => {
    expect(
      JSON.stringify(
        grpcHttpError(
          { code: status.INTERNAL, details: 'postgres://secret' },
          'Cart service',
        ).getResponse(),
      ),
    ).not.toContain('secret');
  });
});
