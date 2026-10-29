import { Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { createClient } from 'redis';
import { SearchProductsQuery } from '../../application/dto/search-products.query';
import {
  ProductSearchCachePort,
  ProductSearchCacheResult,
} from '../../application/ports/product-search-cache.port';
import { ProductEntity } from '../../domain/entities/product.entity';
import { ProductCacheOptions } from './product-cache.config';
import {
  decodeProducts,
  encodeProducts,
  MAX_PRODUCT_CACHE_BYTES,
  productSearchCacheKey,
} from './product-search-cache.codec';

export class RedisProductSearchCache
  implements ProductSearchCachePort, OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(RedisProductSearchCache.name);
  private readonly client;
  private unavailable = false;
  private closing = false;

  constructor(private readonly options: ProductCacheOptions) {
    this.client = createClient({
      url: options.url,
      socket: { connectTimeout: 1000 },
      disableOfflineQueue: true,
      commandsQueueMaxLength: 1000,
    });
    this.client.on('error', () => this.reportUnavailable());
    this.client.on('ready', () => {
      if (this.unavailable && !this.closing) {
        this.logger.log('Product search cache connection recovered.');
      }
      this.unavailable = false;
    });
  }

  onModuleInit(): void {
    void this.client.connect().catch(() => this.reportUnavailable());
  }

  onApplicationShutdown(): void {
    this.closing = true;
    if (this.client.isOpen) this.client.destroy();
  }

  async get(query: SearchProductsQuery): Promise<ProductSearchCacheResult> {
    const key = productSearchCacheKey(query);
    const startedAt = performance.now();
    if (!this.client.isReady) {
      this.log('bypass', key, startedAt, 'not_ready');
      return { status: 'unavailable' };
    }

    let payload: string | null;
    try {
      payload = await this.command((signal) =>
        this.client.withCommandOptions({ abortSignal: signal }).get(key),
      );
    } catch {
      this.log('bypass', key, startedAt, 'read_failed');
      return { status: 'unavailable' };
    }

    if (payload === null) {
      this.log('miss', key, startedAt);
      return { status: 'miss' };
    }
    try {
      const products = decodeProducts(payload);
      this.log('hit', key, startedAt);
      return { status: 'hit', products };
    } catch {
      this.log('miss', key, startedAt, 'invalid_entry');
      return { status: 'miss' };
    }
  }

  async set(query: SearchProductsQuery, products: ProductEntity[]): Promise<void> {
    const key = productSearchCacheKey(query);
    const startedAt = performance.now();
    if (!this.client.isReady) {
      this.log('bypass', key, startedAt, 'not_ready');
      return;
    }
    try {
      const payload = encodeProducts(products);
      if (Buffer.byteLength(payload) > MAX_PRODUCT_CACHE_BYTES) {
        this.log('bypass', key, startedAt, 'oversized');
        return;
      }
      await this.command((signal) =>
        this.client.withCommandOptions({ abortSignal: signal }).set(key, payload, {
          expiration: { type: 'EX', value: this.options.ttlSeconds },
        }),
      );
      this.log('fill', key, startedAt);
    } catch {
      this.log('bypass', key, startedAt, 'write_failed');
    }
  }

  private async command<T>(execute: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('Product cache command timed out.'));
      }, this.options.timeoutMs);
    });
    try {
      // node-redis aborts queued commands. The race also bounds commands already sent.
      return await Promise.race([execute(controller.signal), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  private reportUnavailable(): void {
    if (!this.unavailable && !this.closing) {
      this.logger.warn('Product search cache connection unavailable; searches use PostgreSQL.');
    }
    this.unavailable = true;
  }

  private log(event: string, key: string, startedAt: number, reason?: string): void {
    if (this.options.debug) {
      this.logger.debug({
        event: `product_cache_${event}`,
        keyHash: key.slice(key.lastIndexOf(':') + 1),
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        ...(reason ? { reason } : {}),
      });
    }
  }
}
