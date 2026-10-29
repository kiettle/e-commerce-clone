import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { readProductCacheOptions } from './product-cache.config';

describe('product cache configuration', () => {
  it('defaults to disabled without requiring Redis configuration', () => {
    expect(readProductCacheOptions(new ConfigService({}))).toBeNull();
  });

  it('uses the documented defaults when enabled', () => {
    expect(
      readProductCacheOptions(
        new ConfigService({
          PRODUCT_CACHE_ENABLED: 'true',
          PRODUCT_REDIS_URL: 'redis://127.0.0.1:6379',
        }),
      ),
    ).toEqual({ url: 'redis://127.0.0.1:6379', ttlSeconds: 30, timeoutMs: 100, debug: false });
  });

  it.each([
    { PRODUCT_REDIS_URL: undefined },
    { PRODUCT_REDIS_URL: 'https://example.test' },
    { PRODUCT_CACHE_TTL_SECONDS: '0' },
    { PRODUCT_CACHE_TTL_SECONDS: '1.5' },
    { PRODUCT_CACHE_TIMEOUT_MS: '-1' },
    { PRODUCT_CACHE_TIMEOUT_MS: 'invalid' },
    { PRODUCT_CACHE_TIMEOUT_MS: '2147483648' },
    { PRODUCT_CACHE_DEBUG: 'yes' },
    { PRODUCT_CACHE_ENABLED: 'yes' },
  ])('rejects invalid settings without echoing their values', (changes) => {
    expect(() =>
      readProductCacheOptions(
        new ConfigService({
          PRODUCT_CACHE_ENABLED: 'true',
          PRODUCT_REDIS_URL: 'redis://127.0.0.1:6379',
          ...changes,
        }),
      ),
    ).toThrow(/PRODUCT_/);
  });
});
