import type { CallOptions } from '@grpc/grpc-js';

export function grpcTimeoutMs(value: unknown = 5000, name = 'GRPC_REQUEST_TIMEOUT_MS'): number {
  const milliseconds = Number(value);
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0 || milliseconds > 2_147_483_647) {
    throw new Error(`${name} must be a positive integer no greater than 2147483647.`);
  }
  return milliseconds;
}

// Construct options for each invocation, not once at application startup.
export function grpcDeadline(timeoutMs: number): CallOptions {
  return { deadline: new Date(Date.now() + timeoutMs) };
}
