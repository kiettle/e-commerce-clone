import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const completed = {
  checkoutId: 'checkout',
  status: 'COMPLETED',
  orderId: 50,
  cart: { id: 20, items: [] },
};
const key = '550e8400-e29b-41d4-a716-446655440000';
let fetchMock: ReturnType<typeof vi.fn>;
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (name: string) => storage.get(name) ?? null,
    setItem: (name: string, value: string) => storage.set(name, value),
  });
  vi.stubGlobal('crypto', {
    randomUUID: vi
      .fn()
      .mockReturnValueOnce(key)
      .mockReturnValue('550e8400-e29b-41d4-a716-446655440001'),
  });
  fetchMock = vi.fn().mockResolvedValue(response(completed));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
describe('checkout client identity', () => {
  it('reuses the same key after a deadline and a module reload', async () => {
    fetchMock.mockResolvedValueOnce(response({ message: 'Timed out.' }, 504));
    const { api } = await import('./api');
    await expect(api.checkout('test-token', 20)).rejects.toMatchObject({ status: 504 });
    vi.resetModules();
    const reloaded = await import('./api');
    await expect(reloaded.api.checkout('test-token', 20)).resolves.toEqual(completed);
    expect(fetchMock.mock.calls.map(([, options]) => options.headers['Idempotency-Key'])).toEqual([
      key,
      key,
    ]);
  });
  it('preserves pending outcomes and uses the original key when explicitly retried', async () => {
    const pending = { checkoutId: 'checkout', status: 'RECONCILIATION_REQUIRED' };
    fetchMock.mockResolvedValueOnce(response(pending, 202));
    const { api } = await import('./api');
    await expect(api.checkout('test-token', 20)).resolves.toEqual(pending);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await api.checkout('test-token', 20);
    expect(fetchMock.mock.calls[1][1].headers['Idempotency-Key']).toBe(key);
  });
  it('creates a different identity for a different cart', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(response(completed)));
    const { api } = await import('./api');
    await api.checkout('test-token', 20);
    await api.checkout('test-token', 21);
    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).not.toBe(
      fetchMock.mock.calls[1][1].headers['Idempotency-Key'],
    );
  });
});
