import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from 'redis';
import { SearchProductsUseCase } from '../../application/use-cases/search-products.use-case';
import { NoopProductSearchCache } from './noop-product-search.cache';
import { RedisProductSearchCache } from './redis-product-search.cache';
import { encodeProducts } from './product-search-cache.codec';
import { cachedProduct } from './support/product-cache.fixture';

vi.mock('redis', () => ({ createClient: vi.fn() }));

function setup() {
  const listeners: Record<string, () => void> = {};
  const client = {
    isReady: true,
    isOpen: true,
    on: vi.fn((event: string, callback: () => void) => {
      listeners[event] = callback;
    }),
    connect: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    withCommandOptions: vi.fn(),
  };
  client.withCommandOptions.mockReturnValue(client);
  vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>);
  const cache = new RedisProductSearchCache({
    url: 'redis://localhost:6379',
    ttlSeconds: 30,
    timeoutMs: 100,
    debug: false,
  });
  return { cache, client, listeners };
}

describe('RedisProductSearchCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns restored entities on a hit without writing or renewing the TTL', async () => {
    const { cache, client } = setup();
    client.get.mockResolvedValue(encodeProducts([cachedProduct()]));
    await expect(cache.get({})).resolves.toEqual({ status: 'hit', products: [cachedProduct()] });
    expect(client.set).not.toHaveBeenCalled();
  });

  it('stores payload and expiration together', async () => {
    const { cache, client } = setup();
    await cache.set({}, []);
    expect(client.set).toHaveBeenCalledWith(expect.any(String), '[]', {
      expiration: { type: 'EX', value: 30 },
    });
  });

  it('treats corrupt entries as replaceable misses', async () => {
    const { cache, client } = setup();
    client.get.mockResolvedValue('bad JSON');
    await expect(cache.get({})).resolves.toEqual({ status: 'miss' });
  });

  it('bypasses unavailable Redis without issuing commands', async () => {
    const { cache, client } = setup();
    client.isReady = false;
    await expect(cache.get({})).resolves.toEqual({ status: 'unavailable' });
    await cache.set({}, []);
    expect(client.get).not.toHaveBeenCalled();
    expect(client.set).not.toHaveBeenCalled();
  });

  it('absorbs command errors and returns the database result when population fails', async () => {
    const { cache, client } = setup();
    client.get.mockRejectedValueOnce(new Error('Connection lost'));
    await expect(cache.get({})).resolves.toEqual({ status: 'unavailable' });
    client.set.mockRejectedValue(new Error('Connection lost'));
    const search = vi.fn().mockResolvedValue([cachedProduct()]);
    const useCase = new SearchProductsUseCase(
      {
        search,
        findById: vi.fn(),
        update: vi.fn(),
        softDelete: vi.fn(),
      },
      cache,
    );
    await expect(useCase.execute({})).resolves.toEqual([cachedProduct()]);
  });

  it('bounds already-sent reads and skips population after timeout', async () => {
    vi.useFakeTimers();
    const { cache, client } = setup();
    let rejectRead!: (error: Error) => void;
    client.get.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectRead = reject;
        }),
    );
    const useCase = new SearchProductsUseCase(
      {
        search: vi.fn().mockResolvedValue([]),
        findById: vi.fn(),
        update: vi.fn(),
        softDelete: vi.fn(),
      },
      cache,
    );
    const result = useCase.execute({});
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toEqual([]);
    expect(client.withCommandOptions.mock.calls[0][0].abortSignal.aborted).toBe(true);
    expect(client.set).not.toHaveBeenCalled();
    rejectRead(new Error('Late failure is handled'));
  });

  it('bounds a cache write that never replies', async () => {
    vi.useFakeTimers();
    const { cache, client } = setup();
    client.set.mockImplementation(() => new Promise(() => {}));
    const result = cache.set({}, []);
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toBeUndefined();
  });

  it('skips entries larger than 256 KiB in UTF-8', async () => {
    const { cache, client } = setup();
    await cache.set({}, [{ ...cachedProduct(), description: 'é'.repeat(128 * 1024) }]);
    expect(client.set).not.toHaveBeenCalled();
  });

  it('connects in the background and closes on shutdown', () => {
    const { cache, client } = setup();
    client.connect.mockImplementation(() => new Promise(() => {}));
    expect(cache.onModuleInit()).toBeUndefined();
    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        disableOfflineQueue: true,
        socket: { connectTimeout: 1000 },
      }),
    );
    cache.onApplicationShutdown();
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it('logs connection loss once until recovery without exposing errors', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const { listeners } = setup();
    listeners.error();
    listeners.error();
    listeners.ready();
    listeners.error();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith('Product search cache connection recovered.');
  });

  it('does not create a Redis client for the disabled adapter', async () => {
    const cache = new NoopProductSearchCache();
    await expect(cache.get()).resolves.toEqual({ status: 'unavailable' });
    await cache.set();
    expect(createClient).not.toHaveBeenCalled();
  });
});
