import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ReleaseStockUseCase } from '../../application/use-cases/release-stock.use-case';
import { ReserveStockUseCase } from '../../application/use-cases/reserve-stock.use-case';
import { InventoryOperationError } from '../../domain/errors/inventory-operation.error';

interface StockOperationGrpcRequest {
  cart_id: string;
  items: Array<{
    product_sku_id: string;
    quantity: number;
  }>;
}

interface StockOperationGrpcResponse {
  success: boolean;
  message: string;
}

@Controller()
export class InventoryGrpcController {
  private readonly logger = new Logger(InventoryGrpcController.name);

  constructor(
    private readonly reserveStockUseCase: ReserveStockUseCase,
    private readonly releaseStockUseCase: ReleaseStockUseCase,
  ) {}

  @GrpcMethod('InventoryService', 'ReserveStock')
  async reserveStock(
    request: StockOperationGrpcRequest,
  ): Promise<StockOperationGrpcResponse> {
    return this.runStockOperation(() =>
      this.reserveStockUseCase.execute(toCommand(request)),
    );
  }

  @GrpcMethod('InventoryService', 'ReleaseStock')
  async releaseStock(
    request: StockOperationGrpcRequest,
  ): Promise<StockOperationGrpcResponse> {
    return this.runStockOperation(() =>
      this.releaseStockUseCase.execute(toCommand(request)),
    );
  }

  private async runStockOperation(
    operation: () => Promise<void>,
  ): Promise<StockOperationGrpcResponse> {
    try {
      await operation();

      return {
        success: true,
        message: 'OK',
      };
    } catch (error) {
      if (error instanceof InventoryOperationError) {
        return {
          success: false,
          message: error.message,
        };
      }

      this.logger.error('Unexpected inventory gRPC error.', error);
      throw error;
    }
  }
}

function toCommand(request: StockOperationGrpcRequest) {
  return {
    cartId: BigInt(request.cart_id),
    items: request.items.map((item) => ({
      productSkuId: BigInt(item.product_sku_id),
      quantity: item.quantity,
    })),
  };
}
