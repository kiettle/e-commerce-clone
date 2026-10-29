import { PrismaPg } from '@prisma/adapter-pg';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { createClient } from 'redis';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../../../../../../prisma/generated/product';
import { SearchProductsUseCase } from '../../application/use-cases/search-products.use-case';
import { PrismaProductRepository } from '../persistence/prisma/product.prisma.repository';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { productSearchCacheKey } from './product-search-cache.codec';
import { RedisProductSearchCache } from './redis-product-search.cache';

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.PRODUCT_INTEGRATION_DATABASE_URL;
const redisUrl = process.env.PRODUCT_REDIS_URL;
const container = process.env.REDIS_TEST_CONTAINER;
const describeWithInfrastructure = databaseUrl && redisUrl && container ? describe : describe.skip;

describeWithInfrastructure('Redis product search with PostgreSQL', () => {
  let prisma: PrismaClient;
  let redis: ReturnType<typeof createClient>;
  let cache: RedisProductSearchCache;
  let repository: PrismaProductRepository;
  let useCase: SearchProductsUseCase;
  let query: { categoryId: bigint };
  let productId: bigint;

  function newCache() {
    return new RedisProductSearchCache({
      url: redisUrl!,
      ttlSeconds: 1,
      timeoutMs: 100,
      debug: false,
    });
  }

  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.endsWith('_test')) {
      throw new Error('Cache integration tests require a *_test database.');
    }
    if (!container!.startsWith('ecommerce-redis-integration-')) {
      throw new Error('Cache tests may only stop their isolated Redis container.');
    }
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    redis = createClient({ url: redisUrl, disableOfflineQueue: true });
    redis.on('error', () => {});
    await redis.connect();
    cache = newCache();
    cache.onModuleInit();
  });

  beforeEach(async () => {
    const category = await prisma.category.create({
      data: { name: 'Cache test', slug: randomUUID() },
    });
    const product = await prisma.product.create({
      data: {
        name: 'Cached keyboard',
        categoryId: category.id,
        sellerId: 1n,
        skus: { create: { skuCode: randomUUID(), price: 19.95 } },
      },
    });
    query = { categoryId: category.id };
    productId = product.id;
    repository = new PrismaProductRepository(prisma as unknown as PrismaService);
    useCase = new SearchProductsUseCase(repository, cache);
    await expect.poll(() => cache.get(query), { timeout: 10_000 }).toEqual({ status: 'miss' });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (redis?.isReady) await redis.del(productSearchCacheKey(query));
    if (productId) {
      await prisma.productSku.deleteMany({ where: { productId } });
      await prisma.product.delete({ where: { id: productId } });
      await prisma.category.delete({ where: { id: query.categoryId } });
    }
  });

  afterAll(async () => {
    cache?.onApplicationShutdown();
    if (redis?.isOpen) redis.destroy();
    await prisma?.$disconnect();
  });

  it('reuses a real database result, keeps hits from extending TTL, and refreshes after expiry', async () => {
    const search = vi.spyOn(repository, 'search');
    const first = await useCase.execute(query);
    const key = productSearchCacheKey(query);
    expect(await redis.pTTL(key)).toBeGreaterThan(0);
    await expect(useCase.execute(query)).resolves.toStrictEqual(first);
    expect(search).toHaveBeenCalledTimes(1);

    await prisma.product.update({ where: { id: productId }, data: { name: 'Updated keyboard' } });
    // Repeated hits must not keep the old entry alive.
    await expect
      .poll(
        async () => {
          await cache.get(query);
          return redis.exists(key);
        },
        { timeout: 3000, interval: 100 },
      )
      .toBe(0);
    const fresh = await useCase.execute(query);
    expect(fresh[0].name).toBe('Updated keyboard');
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('returns a stale result before expiry and replaces malformed payloads with fresh data', async () => {
    const first = await useCase.execute(query);
    await prisma.product.update({ where: { id: productId }, data: { name: 'Renamed keyboard' } });
    await expect(useCase.execute(query)).resolves.toStrictEqual(first);
    await redis.set(productSearchCacheKey(query), '[{"id":1}]');
    const fresh = await useCase.execute(query);
    expect(fresh[0].name).toBe('Renamed keyboard');
    await expect(cache.get(query)).resolves.toEqual({ status: 'hit', products: fresh });
  });

  it('shares cached results across independent clients without mixing search filters', async () => {
    const secondCache = newCache();
    secondCache.onModuleInit();
    const differentQuery = { ...query, name: 'does-not-match' };
    try {
      await expect
        .poll(() => secondCache.get(query), { timeout: 10_000 })
        .toEqual({ status: 'miss' });
      const first = await useCase.execute(query);
      const search = vi.spyOn(repository, 'search');
      const secondUseCase = new SearchProductsUseCase(repository, secondCache);
      await expect(secondUseCase.execute(query)).resolves.toStrictEqual(first);
      expect(search).not.toHaveBeenCalled();
      await expect(secondUseCase.execute(differentQuery)).resolves.toEqual([]);
      expect(search).toHaveBeenCalledOnce();
      await expect(cache.get(query)).resolves.toEqual({ status: 'hit', products: first });
      await expect(cache.get(differentQuery)).resolves.toEqual({ status: 'hit', products: [] });
    } finally {
      secondCache.onApplicationShutdown();
      await redis.del(productSearchCacheKey(differentQuery));
    }
  });

  it('returns database results when Redis stalls during cache population', async () => {
    const search = repository.search.bind(repository);
    vi.spyOn(repository, 'search').mockImplementation(async (filters) => {
      const products = await search(filters);
      // The cache GET has already missed; pause Redis before the subsequent SET.
      await redis.sendCommand(['CLIENT', 'PAUSE', '700', 'ALL']);
      return products;
    });
    const started = performance.now();
    try {
      const products = await useCase.execute(query);
      expect(products[0].id).toBe(productId);
      expect(performance.now() - started).toBeLessThan(600);
    } finally {
      // A sent SET may complete after the caller's deadline. Wait before cleanup.
      await redis.ping();
    }
    expect(await redis.pTTL(productSearchCacheKey(query))).toBeGreaterThan(0);
    await expect(cache.get(query)).resolves.toMatchObject({ status: 'hit' });
  });

  it('bounds a read already sent to a paused Redis server and skips population', async () => {
    const set = vi.spyOn(cache, 'set');
    await redis.sendCommand(['CLIENT', 'PAUSE', '700', 'ALL']);
    const started = performance.now();
    try {
      const products = await useCase.execute(query);
      expect(products[0].id).toBe(productId);
      expect(performance.now() - started).toBeLessThan(600);
      expect(set).not.toHaveBeenCalled();
    } finally {
      // Wait until Redis processes the late reply before cleaning up the fixture.
      await redis.ping();
    }
  });

  it('starts while Redis is down, serves PostgreSQL, and resumes caching after recovery', async () => {
    cache.onApplicationShutdown();
    await execFileAsync('docker', ['stop', container!], { timeout: 30_000 });
    try {
      cache = newCache();
      expect(cache.onModuleInit()).toBeUndefined();
      useCase = new SearchProductsUseCase(repository, cache);
      const search = vi.spyOn(repository, 'search');
      const products = await useCase.execute(query);
      expect(products[0].id).toBe(productId);
      expect(search).toHaveBeenCalledOnce();
    } finally {
      await execFileAsync('docker', ['start', container!], { timeout: 30_000 });
    }
    await expect.poll(() => cache.get(query), { timeout: 15_000 }).toEqual({ status: 'miss' });
    const products = await useCase.execute(query);
    await expect(cache.get(query)).resolves.toEqual({ status: 'hit', products });
    await expect.poll(() => redis.isReady, { timeout: 15_000 }).toBe(true);
  });
});
