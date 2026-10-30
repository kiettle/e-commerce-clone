// Bound shutdown waits; leases and uncommitted messages preserve unfinished work.
export async function drainOnShutdown(
  task: Promise<unknown>,
  timeoutMs: number,
  unfinished: (reason: 'timed out' | 'failed') => void,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      task,
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          unfinished('timed out');
          resolve();
        }, timeoutMs);
      }),
    ]);
  } catch {
    unfinished('failed');
  } finally {
    if (timer) clearTimeout(timer);
  }
}
