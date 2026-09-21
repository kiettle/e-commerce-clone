import { spawn, type ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { allocatePorts } from './support/ports';

describe('product outbox and flash-sale checkout', () => {
  let child: ChildProcess | undefined;

  afterEach(async () => {
    if (!child || child.exitCode !== null) {
      return;
    }

    const runningChild = child;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        runningChild.kill('SIGKILL');
        resolve();
      }, 5_000);
      runningChild.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      runningChild.kill('SIGTERM');
    });
  });

  it('completes broker recovery, replay, expiry, and concurrency scenarios', async () => {
    const ports = await allocatePorts(8);
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child = spawn('bash', ['scripts/test-product-outbox-e2e.sh'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          OUTBOX_PRODUCT_API_PORT: String(ports[0]),
          OUTBOX_PUBLISHER_API_PORT: String(ports[1]),
          OUTBOX_REPLAY_API_PORT: String(ports[2]),
          OUTBOX_INVENTORY_API_PORT: String(ports[3]),
          OUTBOX_INVENTORY_GRPC_PORT: String(ports[4]),
          SALE_E2E_CART_API_PORT: String(ports[5]),
          SALE_E2E_ORDER_API_PORT: String(ports[6]),
          SALE_E2E_ORDER_GRPC_PORT: String(ports[7]),
        },
        stdio: 'inherit',
      });
      child.once('error', reject);
      child.once('exit', resolve);
    });

    child = undefined;
    expect(exitCode).toBe(0);
  });
});
