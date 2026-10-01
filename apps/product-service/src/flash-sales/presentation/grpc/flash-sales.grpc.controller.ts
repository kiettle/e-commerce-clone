import { Controller, Logger } from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { CancelFlashSaleUseCase } from '../../application/use-cases/cancel-flash-sale.use-case';
import { CreateFlashSaleUseCase } from '../../application/use-cases/create-flash-sale.use-case';
import { GetFlashSaleUseCase } from '../../application/use-cases/get-flash-sale.use-case';
import { ListFlashSalesUseCase } from '../../application/use-cases/list-flash-sales.use-case';
import { ScheduleFlashSaleUseCase } from '../../application/use-cases/schedule-flash-sale.use-case';
import { UpdateFlashSaleUseCase } from '../../application/use-cases/update-flash-sale.use-case';
import { FlashSaleStatus } from '../../domain/enums/flash-sale-status.enum';
import { FlashSaleEntity } from '../../domain/entities/flash-sale.entity';
import { FlashSaleNotDraftError } from '../../domain/errors/flash-sale-not-draft.error';
import { FlashSaleNotFoundError } from '../../domain/errors/flash-sale-not-found.error';
import { FlashSaleOverlapError } from '../../domain/errors/flash-sale-overlap.error';
import { FlashSalePriceChangedError } from '../../domain/errors/flash-sale-price-changed.error';
import { FlashSaleProductInactiveError } from '../../domain/errors/flash-sale-product-inactive.error';
import { FlashSaleScheduleTimeError } from '../../domain/errors/flash-sale-schedule-time.error';
import { FlashSaleSkuInactiveError } from '../../domain/errors/flash-sale-sku-inactive.error';
import { FlashSaleSkuNotFoundError } from '../../domain/errors/flash-sale-sku-not-found.error';
import { InvalidFlashSaleError } from '../../domain/errors/invalid-flash-sale.error';
import { Clock } from '../../domain/services/clock';

interface FlashSaleItemGrpcRequest {
  product_sku_id?: string;
  sale_price?: number;
  stock_limit?: number;
  max_quantity_per_user?: number;
}

interface CreateFlashSaleGrpcRequest {
  created_by?: string;
  name?: string;
  description?: string;
  starts_at?: string;
  ends_at?: string;
  items?: FlashSaleItemGrpcRequest[];
}

interface UpdateFlashSaleGrpcRequest {
  flash_sale_id?: string;
  name?: string;
  description?: string;
  description_is_null?: boolean;
  starts_at?: string;
  ends_at?: string;
  items?: FlashSaleItemGrpcRequest[];
}

interface ListFlashSalesGrpcRequest {
  status?: string;
}

interface FlashSaleIdGrpcRequest {
  flash_sale_id?: string;
}

interface GetFlashSaleGrpcRequest extends FlashSaleIdGrpcRequest {
  user_role?: string;
}

interface FlashSaleGrpcResponse {
  id: string;
  name: string;
  description?: string;
  starts_at: string;
  ends_at: string;
  status: string;
  items: Array<{
    id: string;
    product_sku_id: string;
    original_price: number;
    sale_price: number;
    stock_limit: number;
    max_quantity_per_user: number;
  }>;
  created_at: string;
  updated_at: string;
}

interface PublicFlashSaleGrpcResponse {
  id: string;
  name: string;
  description?: string;
  starts_at: string;
  ends_at: string;
  status: string;
  items: Array<{
    id: string;
    product_sku_id: string;
    product_name: string;
    image_url?: string;
    original_price: number;
    sale_price: number;
    availability: string;
    max_quantity_per_user: number;
  }>;
  created_at: string;
  updated_at: string;
}

@Controller()
export class FlashSalesGrpcController {
  private readonly logger = new Logger(FlashSalesGrpcController.name);

  constructor(
    private readonly createFlashSale: CreateFlashSaleUseCase,
    private readonly updateFlashSale: UpdateFlashSaleUseCase,
    private readonly cancelFlashSale: CancelFlashSaleUseCase,
    private readonly getFlashSale: GetFlashSaleUseCase,
    private readonly listFlashSales: ListFlashSalesUseCase,
    private readonly scheduleFlashSale: ScheduleFlashSaleUseCase,
  ) {}

  @GrpcMethod('ProductService', 'CreateFlashSale')
  async create(request: CreateFlashSaleGrpcRequest): Promise<FlashSaleGrpcResponse> {
    try {
      const flashSale = await this.createFlashSale.execute({
        createdBy: positiveBigInt(request.created_by, 'created_by'),
        name: requiredText(request.name, 'name', 255),
        description: request.description,
        startsAt: requiredDate(request.starts_at, 'starts_at'),
        endsAt: requiredDate(request.ends_at, 'ends_at'),
        items: mapItems(request.items),
      });
      return toFlashSaleGrpcResponse(flashSale);
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  @GrpcMethod('ProductService', 'ListFlashSales')
  async list(
    request: ListFlashSalesGrpcRequest,
  ): Promise<{ flash_sales: PublicFlashSaleGrpcResponse[] }> {
    try {
      const status =
        request.status === 'active'
          ? FlashSaleStatus.Active
          : request.status === 'upcoming'
            ? FlashSaleStatus.Upcoming
            : undefined;
      if (!status) {
        throw new InvalidGrpcRequestError('status must be active or upcoming.');
      }
      const result = await this.listFlashSales.execute(status);
      const clock = { now: () => result.evaluatedAt };
      return {
        flash_sales: result.flashSales.map((flashSale) =>
          toPublicFlashSaleGrpcResponse(flashSale, clock),
        ),
      };
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  @GrpcMethod('ProductService', 'UpdateFlashSale')
  async update(request: UpdateFlashSaleGrpcRequest): Promise<FlashSaleGrpcResponse> {
    try {
      const flashSale = await this.updateFlashSale.execute({
        flashSaleId: positiveBigInt(request.flash_sale_id, 'flash_sale_id'),
        name: requiredText(request.name, 'name', 255),
        description: requiredNullableText(
          request.description,
          request.description_is_null,
          'description',
        ),
        startsAt: requiredDate(request.starts_at, 'starts_at'),
        endsAt: requiredDate(request.ends_at, 'ends_at'),
        items: mapItems(request.items),
      });
      return toFlashSaleGrpcResponse(flashSale);
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  @GrpcMethod('ProductService', 'CancelFlashSale')
  async cancel(request: FlashSaleIdGrpcRequest): Promise<FlashSaleGrpcResponse> {
    try {
      const flashSale = await this.cancelFlashSale.execute(
        positiveBigInt(request.flash_sale_id, 'flash_sale_id'),
      );
      return toFlashSaleGrpcResponse(flashSale);
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  @GrpcMethod('ProductService', 'ScheduleFlashSale')
  async schedule(request: FlashSaleIdGrpcRequest): Promise<FlashSaleGrpcResponse> {
    try {
      const flashSale = await this.scheduleFlashSale.execute(
        positiveBigInt(request.flash_sale_id, 'flash_sale_id'),
      );
      return toFlashSaleGrpcResponse(flashSale);
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  @GrpcMethod('ProductService', 'GetFlashSale')
  async get(request: GetFlashSaleGrpcRequest): Promise<PublicFlashSaleGrpcResponse> {
    try {
      const flashSaleId = positiveBigInt(request.flash_sale_id, 'flash_sale_id');
      const flashSale = await this.getFlashSale.execute(flashSaleId);
      if (
        request.user_role !== 'ADMIN' &&
        (flashSale.status === FlashSaleStatus.Draft ||
          flashSale.status === FlashSaleStatus.Cancelled)
      ) {
        throw new FlashSaleNotFoundError(flashSaleId);
      }
      return toPublicFlashSaleGrpcResponse(flashSale);
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  private toRpcException(error: unknown): RpcException {
    if (error instanceof RpcException) {
      return error;
    }
    if (error instanceof InvalidGrpcRequestError) {
      return createRpcException(GrpcStatus.INVALID_ARGUMENT, error.message);
    }
    if (error instanceof FlashSaleNotFoundError || error instanceof FlashSaleSkuNotFoundError) {
      return createRpcException(
        GrpcStatus.NOT_FOUND,
        error.message,
        error instanceof FlashSaleNotFoundError ? error.code : 'FLASH_SALE_NOT_FOUND',
      );
    }
    if (
      error instanceof FlashSaleNotDraftError ||
      error instanceof FlashSaleOverlapError ||
      error instanceof FlashSalePriceChangedError ||
      error instanceof FlashSaleProductInactiveError ||
      error instanceof FlashSaleSkuInactiveError
    ) {
      return createRpcException(
        GrpcStatus.FAILED_PRECONDITION,
        error.message,
        'code' in error && typeof error.code === 'string'
          ? error.code
          : 'FLASH_SALE_NOT_SCHEDULABLE',
      );
    }
    if (error instanceof FlashSaleScheduleTimeError) {
      return createRpcException(GrpcStatus.INVALID_ARGUMENT, error.message, error.code);
    }
    if (error instanceof InvalidFlashSaleError) {
      return createRpcException(
        error.code === 'FLASH_SALE_NOT_SCHEDULABLE'
          ? GrpcStatus.FAILED_PRECONDITION
          : GrpcStatus.INVALID_ARGUMENT,
        error.message,
        error.code,
      );
    }

    this.logger.error('Flash-sale gRPC request failed.', error);
    return createRpcException(GrpcStatus.UNAVAILABLE, 'Product service is unavailable.');
  }
}

class InvalidGrpcRequestError extends Error {}

function mapItems(items: FlashSaleItemGrpcRequest[] | undefined) {
  return (items ?? []).map((item) => ({
    productSkuId: positiveBigInt(item.product_sku_id, 'product_sku_id'),
    salePrice: positiveNumber(item.sale_price, 'sale_price'),
    stockLimit: positiveInteger(item.stock_limit, 'stock_limit'),
    maxQuantityPerUser: exactlyOne(item.max_quantity_per_user, 'max_quantity_per_user'),
  }));
}

const systemClock: Clock = { now: () => new Date() };

function toFlashSaleGrpcResponse(
  flashSale: FlashSaleEntity,
  clock: Clock = systemClock,
): FlashSaleGrpcResponse {
  assertPersistedFlashSale(flashSale);
  return {
    id: flashSale.id.toString(),
    name: flashSale.name,
    ...(flashSale.description == null ? {} : { description: flashSale.description }),
    starts_at: flashSale.startsAt.toISOString(),
    ends_at: flashSale.endsAt.toISOString(),
    status: flashSale.getEffectiveStatus(clock),
    items: flashSale.items.map((item) => ({
      id: item.id!.toString(),
      product_sku_id: item.productSkuId.toString(),
      original_price: item.originalPrice,
      sale_price: item.salePrice,
      stock_limit: item.stockLimit,
      max_quantity_per_user: item.maxQuantityPerUser,
    })),
    created_at: flashSale.createdAt.toISOString(),
    updated_at: flashSale.updatedAt.toISOString(),
  };
}

function toPublicFlashSaleGrpcResponse(
  flashSale: FlashSaleEntity,
  clock: Clock = systemClock,
): PublicFlashSaleGrpcResponse {
  const response = toFlashSaleGrpcResponse(flashSale, clock);
  return {
    id: response.id,
    name: response.name,
    ...(response.description == null ? {} : { description: response.description }),
    starts_at: response.starts_at,
    ends_at: response.ends_at,
    status: response.status,
    items: flashSale.items.map((item) => ({
      id: item.id!.toString(),
      product_sku_id: item.productSkuId.toString(),
      product_name: item.productName ?? '',
      ...(item.imageUrl == null ? {} : { image_url: item.imageUrl }),
      original_price: item.originalPrice,
      sale_price: item.salePrice,
      availability: 'UNKNOWN',
      max_quantity_per_user: item.maxQuantityPerUser,
    })),
    created_at: response.created_at,
    updated_at: response.updated_at,
  };
}

function assertPersistedFlashSale(
  flashSale: FlashSaleEntity,
): asserts flashSale is FlashSaleEntity & {
  id: bigint;
  createdAt: Date;
  updatedAt: Date;
} {
  if (
    flashSale.id === undefined ||
    flashSale.createdAt === undefined ||
    flashSale.updatedAt === undefined ||
    flashSale.items.some((item) => item.id === undefined)
  ) {
    throw new Error('A persisted flash sale is required for a gRPC response.');
  }
}

function createRpcException(code: GrpcStatus, message: string, errorCode?: string): RpcException {
  return new RpcException({
    code,
    message: errorCode ? JSON.stringify({ code: errorCode, message }) : message,
  });
}

function positiveBigInt(value: string | undefined, field: string): bigint {
  if (!value || !/^\d+$/.test(value)) {
    throw new InvalidGrpcRequestError(`${field} must be a positive integer.`);
  }
  const parsed = BigInt(value);
  if (parsed <= 0n) {
    throw new InvalidGrpcRequestError(`${field} must be a positive integer.`);
  }
  return parsed;
}

function positiveNumber(value: number | undefined, field: string): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    throw new InvalidGrpcRequestError(`${field} must be a positive number.`);
  }
  return value;
}

function positiveInteger(value: number | undefined, field: string): number {
  if (value === undefined || !Number.isInteger(value) || value <= 0) {
    throw new InvalidGrpcRequestError(`${field} must be a positive integer.`);
  }
  return value;
}

function requiredText(value: string | undefined, field: string, maxLength?: number): string {
  if (!value?.trim()) {
    throw new InvalidGrpcRequestError(`${field} must not be empty.`);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    throw new InvalidGrpcRequestError(`${field} must not exceed ${maxLength} characters.`);
  }
  return value;
}

function exactlyOne(value: number | undefined, field: string): number {
  if (value !== 1) {
    throw new InvalidGrpcRequestError(`${field} must be exactly one.`);
  }
  return value;
}

function requiredNullableText(
  value: string | undefined,
  isNull: boolean | undefined,
  field: string,
): string | null {
  if (isNull) {
    return null;
  }
  if (value === undefined) {
    throw new InvalidGrpcRequestError(`${field} must be provided.`);
  }
  return value;
}

function requiredDate(value: string | undefined, field: string): Date {
  const parsed = new Date(value ?? '');
  if (!value || !Number.isFinite(parsed.getTime())) {
    throw new InvalidGrpcRequestError(`${field} must be an ISO date-time.`);
  }
  return parsed;
}
