import { ConfigService } from '@nestjs/config';

export interface ProductCacheOptions {
  url: string;
  ttlSeconds: number;
  timeoutMs: number;
  debug: boolean;
}

export function readProductCacheOptions(config: ConfigService): ProductCacheOptions | null {
  if (!booleanSetting(config, 'PRODUCT_CACHE_ENABLED')) {
    return null;
  }

  const url = config.get<string>('PRODUCT_REDIS_URL');
  try {
    if (!url || !['redis:', 'rediss:'].includes(new URL(url).protocol)) {
      throw new Error();
    }
  } catch {
    throw new Error(
      'PRODUCT_REDIS_URL must be a valid redis:// or rediss:// URL when caching is enabled.',
    );
  }

  return {
    url,
    ttlSeconds: positiveInteger(config, 'PRODUCT_CACHE_TTL_SECONDS', 30),
    timeoutMs: positiveInteger(config, 'PRODUCT_CACHE_TIMEOUT_MS', 100),
    debug: booleanSetting(config, 'PRODUCT_CACHE_DEBUG'),
  };
}

function booleanSetting(config: ConfigService, name: string): boolean {
  const value = config.get<string>(name) ?? 'false';
  if (value !== 'true' && value !== 'false') {
    throw new Error(`${name} must be true or false.`);
  }
  return value === 'true';
}

function positiveInteger(config: ConfigService, name: string, fallback: number): number {
  const value = Number(config.get<string>(name) ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) {
    throw new Error(`${name} must be a positive integer no greater than 2147483647.`);
  }
  return value;
}
