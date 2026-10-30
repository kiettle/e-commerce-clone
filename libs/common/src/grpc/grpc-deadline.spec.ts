import { describe, it, expect, vi, afterEach } from 'vitest';
import { grpcDeadline, grpcTimeoutMs } from './grpc-deadline';
afterEach(() => vi.useRealTimers());
describe('RPC deadlines', () => {
  it.each([0, -1, 1.5, NaN, Infinity, 'invalid', 2147483648])(
    'rejects invalid timeout %s',
    (value) => {
      expect(() => grpcTimeoutMs(value)).toThrow('GRPC_REQUEST_TIMEOUT_MS');
    },
  );
  it('makes a fresh deadline per call', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    expect(grpcDeadline(5000).deadline).toEqual(new Date(6000));
    vi.setSystemTime(2000);
    expect(grpcDeadline(5000).deadline).toEqual(new Date(7000));
  });
});
