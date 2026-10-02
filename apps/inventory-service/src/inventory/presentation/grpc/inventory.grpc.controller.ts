import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { CommitStockUseCase } from '../../application/use-cases/commit-stock.use-case';
import { ReleaseStockUseCase } from '../../application/use-cases/release-stock.use-case';
import { ReserveStockUseCase } from '../../application/use-cases/reserve-stock.use-case';
import { InventoryOperationError } from '../../domain/errors/inventory-operation.error';

export interface StockOperationGrpcRequest {
  cart_id?: string;
  checkout_id?: string;
  user_id?: string;
  items: Array<{
    product_sku_id: string;
    quantity: number;
    flash_sale_id?: string;
    flash_sale_item_id?: string;
  }>;
}

interface StockOperationGrpcResponse {
  success: boolean;
  message: string;
  error_code: string;
}

@Controller()
export class InventoryGrpcController {
  private readonly logger = new Logger(InventoryGrpcController.name);

  constructor(
    private readonly reserveStockUseCase: ReserveStockUseCase,
    private readonly releaseStockUseCase: ReleaseStockUseCase,
    private readonly commitStockUseCase: CommitStockUseCase,
  ) {}

  @GrpcMethod('InventoryService', 'ReserveStock')
  async reserveStock(request: StockOperationGrpcRequest): Promise<StockOperationGrpcResponse> {
    return this.runStockOperation(() => this.reserveStockUseCase.execute(toCommand(request)));
  }

  @GrpcMethod('InventoryService', 'ReleaseStock')
  async releaseStock(request: StockOperationGrpcRequest): Promise<StockOperationGrpcResponse> {
    return this.runStockOperation(() => this.releaseStockUseCase.execute(toCommand(request)));
  }

  @GrpcMethod('InventoryService', 'CommitStock')
  async commitStock(request: StockOperationGrpcRequest): Promise<StockOperationGrpcResponse> {
    return this.runStockOperation(() => this.commitStockUseCase.execute(toCommand(request)));
  }

  private async runStockOperation(
    operation: () => Promise<void>,
  ): Promise<StockOperationGrpcResponse> {
    try {
      await operation();

      return {
        success: true,
        message: 'OK',
        error_code: '',
      };
    } catch (error) {
      if (error instanceof InventoryOperationError) {
        return {
          success: false,
          message: error.message,
          error_code: error.code,
        };
      }

      this.logger.error('Unexpected inventory gRPC error.', error);
      throw error;
    }
  }
}

export function toCommand(request: StockOperationGrpcRequest) {
  return {
    cartId: requiredBigInt(request.cart_id),
    checkoutId: request.checkout_id ?? '',
    userId: requiredBigInt(request.user_id),
    items: request.items.map((item) => ({
      productSkuId: requiredBigInt(item.product_sku_id),
      quantity: item.quantity,
      flashSaleId: optionalBigInt(item.flash_sale_id),
      flashSaleItemId: optionalBigInt(item.flash_sale_item_id),
    })),
  };
}

function optionalBigInt(value: string | undefined): bigint | null {
  if (value == null) {
    return null;
  }
  return requiredBigInt(value);
}

function requiredBigInt(value: string | undefined): bigint {
  try {
    return BigInt(value ?? 0);
  } catch {
    return 0n;
  }
}
