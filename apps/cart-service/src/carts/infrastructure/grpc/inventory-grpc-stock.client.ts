import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientGrpc, ClientProxyFactory, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { Observable, firstValueFrom } from 'rxjs';
import { InventoryCommitFailedError } from '../../domain/errors/inventory-commit-failed.error';
import { InventoryReleaseFailedError } from '../../domain/errors/inventory-release-failed.error';
import { InventoryReservationFailedError } from '../../domain/errors/inventory-reservation-failed.error';
import {
  InventoryStockPort,
  StockOperationRequest,
} from '../../application/ports/inventory-stock.port';

interface CloseableClientGrpc extends ClientGrpc {
  close?: () => void;
}

export interface StockOperationGrpcRequest {
  cart_id: string;
  checkout_id: string;
  user_id: string;
  items: Array<{
    product_sku_id: string;
    quantity: number;
    flash_sale_id?: string;
    flash_sale_item_id?: string;
  }>;
}

interface StockOperationGrpcResponse {
  success: boolean;
  message?: string;
}

interface InventoryGrpcService {
  reserveStock(request: StockOperationGrpcRequest): Observable<StockOperationGrpcResponse>;
  releaseStock(request: StockOperationGrpcRequest): Observable<StockOperationGrpcResponse>;
  commitStock(request: StockOperationGrpcRequest): Observable<StockOperationGrpcResponse>;
}

@Injectable()
export class InventoryGrpcStockClient implements InventoryStockPort, OnModuleInit, OnModuleDestroy {
  private client?: CloseableClientGrpc;
  private inventoryService?: InventoryGrpcService;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.client = this.createClient();
    this.inventoryService = this.client.getService<InventoryGrpcService>('InventoryService');
  }

  onModuleDestroy(): void {
    this.client?.close?.();
  }

  async reserveStock(request: StockOperationRequest): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.getInventoryService().reserveStock(toGrpcRequest(request)),
      );

      if (!response.success) {
        throw new InventoryReservationFailedError(
          response.message ?? 'Inventory reservation failed.',
        );
      }
    } catch (error) {
      if (error instanceof InventoryReservationFailedError) {
        throw error;
      }

      throw new InventoryReservationFailedError('Inventory service request failed.', 'UNCERTAIN');
    }
  }

  async releaseStock(request: StockOperationRequest): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.getInventoryService().releaseStock(toGrpcRequest(request)),
      );

      if (!response.success) {
        throw new InventoryReleaseFailedError(response.message ?? 'Inventory release failed.');
      }
    } catch (error) {
      if (error instanceof InventoryReleaseFailedError) {
        throw error;
      }

      throw new InventoryReleaseFailedError('Inventory service request failed.', 'UNCERTAIN');
    }
  }

  async commitStock(request: StockOperationRequest): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.getInventoryService().commitStock(toGrpcRequest(request)),
      );

      if (!response.success) {
        throw new InventoryCommitFailedError(response.message ?? 'Inventory commit failed.');
      }
    } catch (error) {
      if (error instanceof InventoryCommitFailedError) {
        throw error;
      }

      throw new InventoryCommitFailedError('Inventory service request failed.', 'UNCERTAIN');
    }
  }

  protected createClient(): CloseableClientGrpc {
    return ClientProxyFactory.create({
      transport: Transport.GRPC,
      options: {
        package: 'inventory',
        protoPath: join(process.cwd(), 'libs/proto/inventory.proto'),
        url: this.configService.get<string>('INVENTORY_GRPC_URL') ?? 'localhost:9003',
        loader: {
          keepCase: true,
          longs: String,
        },
      },
    }) as CloseableClientGrpc;
  }

  private getInventoryService(): InventoryGrpcService {
    if (!this.inventoryService) {
      throw new InventoryReservationFailedError(
        'Inventory gRPC client is not initialized.',
        'UNCERTAIN',
      );
    }

    return this.inventoryService;
  }
}

export function toGrpcRequest(request: StockOperationRequest): StockOperationGrpcRequest {
  return {
    cart_id: request.cartId.toString(),
    checkout_id: request.checkoutId,
    user_id: request.userId.toString(),
    items: request.items.map((item) => ({
      product_sku_id: item.productSkuId.toString(),
      quantity: item.quantity,
      ...(item.flashSaleId == null ? {} : { flash_sale_id: item.flashSaleId.toString() }),
      ...(item.flashSaleItemId == null
        ? {}
        : { flash_sale_item_id: item.flashSaleItemId.toString() }),
    })),
  };
}
