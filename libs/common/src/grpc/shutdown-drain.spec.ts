import { describe, it, expect, vi } from 'vitest';
import { drainOnShutdown } from './shutdown-drain';
describe('bounded consumer shutdown', () => {
  it('waits for in-flight work without reporting a timeout', async () => {
    const timedOut = vi.fn();
    let finish!: () => void;
    const task = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let drained = false;
    const stop = drainOnShutdown(task, 1000, timedOut).then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);
    finish();
    await stop;
    expect(timedOut).not.toHaveBeenCalled();
  });
  it('bounds a stalled drain so shutdown can proceed', async () => {
    const timedOut = vi.fn();
    await drainOnShutdown(new Promise(() => undefined), 5, timedOut);
    expect(timedOut).toHaveBeenCalledOnce();
  });
});

it('reports a rejected drain without blocking later resource cleanup', async () => {
  const unfinished = vi.fn();
  await expect(
    drainOnShutdown(Promise.reject(new Error('private failure')), 1000, unfinished),
  ).resolves.toBeUndefined();
  expect(unfinished).toHaveBeenCalledWith('failed');
});
