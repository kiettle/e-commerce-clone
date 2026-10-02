import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { ConfigService } from '@nestjs/config';
import { ClientGrpc, ClientProxyFactory, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { Observable, firstValueFrom } from 'rxjs';
import {
  ProductCatalogPort,
  ProductSkuSnapshot,
} from '../../application/ports/product-catalog.port';
import { ProductSnapshotUnavailableError } from '../../domain/errors/product-snapshot-unavailable.error';

interface CloseableClientGrpc extends ClientGrpc {
  close?: () => void;
}

interface ProductSkuSnapshotGrpcResponse {
  product_id: string;
  product_name: string;
  image_url?: string;
  product_sku_id: string;
  sku_code: string;
  regular_price: number;
  effective_price: number;
  price_source: 'REGULAR' | 'FLASH_SALE';
  flash_sale_id?: string;
  flash_sale_item_id?: string;
  sale_ends_at?: string;
  max_quantity_per_user?: number;
}

interface ProductGrpcService {
  getProductSkuSnapshot(request: {
    product_sku_id: string;
  }): Observable<ProductSkuSnapshotGrpcResponse>;
}

interface GrpcErrorLike {
  code?: number;
  details?: string;
  message?: string;
}

@Injectable()
export class ProductGrpcCatalogClient implements ProductCatalogPort, OnModuleInit, OnModuleDestroy {
  private client?: CloseableClientGrpc;
  private productService?: ProductGrpcService;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.client = this.createClient();
    this.productService = this.client.getService<ProductGrpcService>('ProductService');
  }

  onModuleDestroy(): void {
    this.client?.close?.();
  }

  async getProductSkuSnapshot(productSkuId: bigint): Promise<ProductSkuSnapshot | null> {
    try {
      const snapshot = await firstValueFrom(
        this.getProductService().getProductSkuSnapshot({
          product_sku_id: productSkuId.toString(),
        }),
      );

      return {
        productId: BigInt(snapshot.product_id),
        productName: snapshot.product_name,
        imageUrl: snapshot.image_url ?? null,
        productSkuId: BigInt(snapshot.product_sku_id),
        skuCode: snapshot.sku_code,
        price: snapshot.effective_price,
        regularPrice: snapshot.regular_price,
        priceSource: snapshot.price_source,
        flashSaleId: snapshot.flash_sale_id ? BigInt(snapshot.flash_sale_id) : null,
        flashSaleItemId: snapshot.flash_sale_item_id ? BigInt(snapshot.flash_sale_item_id) : null,
        saleEndsAt: snapshot.sale_ends_at ? new Date(snapshot.sale_ends_at) : null,
        maxPerUserQuantity: snapshot.max_quantity_per_user ?? null,
      };
    } catch (error) {
      if (grpcErrorCode(error) === GrpcStatus.NOT_FOUND) {
        return null;
      }
      if (error instanceof ProductSnapshotUnavailableError) {
        throw error;
      }
      throw new ProductSnapshotUnavailableError(grpcErrorMessage(error));
    }
  }

  protected createClient(): CloseableClientGrpc {
    return ClientProxyFactory.create({
      transport: Transport.GRPC,
      options: {
        package: 'product',
        protoPath: join(process.cwd(), 'libs/proto/product.proto'),
        url: this.configService.get<string>('PRODUCT_GRPC_URL') ?? 'localhost:9001',
        loader: {
          keepCase: true,
          longs: String,
        },
      },
    }) as CloseableClientGrpc;
  }

  private getProductService(): ProductGrpcService {
    if (!this.productService) {
      throw new ProductSnapshotUnavailableError('Product gRPC client is not initialized.');
    }
    return this.productService;
  }
}

function grpcErrorCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  return typeof error.code === 'number' ? error.code : undefined;
}

function grpcErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const grpcError = error as GrpcErrorLike;
    if (grpcError.details) {
      return grpcError.details;
    }
  }
  return 'Product service request failed.';
}
