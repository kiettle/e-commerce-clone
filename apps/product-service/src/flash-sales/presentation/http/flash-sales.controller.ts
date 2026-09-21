import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CancelFlashSaleUseCase } from '../../application/use-cases/cancel-flash-sale.use-case';
import { CreateFlashSaleUseCase } from '../../application/use-cases/create-flash-sale.use-case';
import { GetFlashSaleUseCase } from '../../application/use-cases/get-flash-sale.use-case';
import { ListFlashSalesUseCase } from '../../application/use-cases/list-flash-sales.use-case';
import { ScheduleFlashSaleUseCase } from '../../application/use-cases/schedule-flash-sale.use-case';
import { UpdateFlashSaleUseCase } from '../../application/use-cases/update-flash-sale.use-case';
import { FlashSaleStatus } from '../../domain/enums/flash-sale-status.enum';
import { FlashSaleNotDraftError } from '../../domain/errors/flash-sale-not-draft.error';
import { FlashSaleNotFoundError } from '../../domain/errors/flash-sale-not-found.error';
import { FlashSaleOverlapError } from '../../domain/errors/flash-sale-overlap.error';
import { FlashSalePriceChangedError } from '../../domain/errors/flash-sale-price-changed.error';
import { FlashSaleProductInactiveError } from '../../domain/errors/flash-sale-product-inactive.error';
import { FlashSaleScheduleTimeError } from '../../domain/errors/flash-sale-schedule-time.error';
import { FlashSaleSkuInactiveError } from '../../domain/errors/flash-sale-sku-inactive.error';
import { FlashSaleSkuNotFoundError } from '../../domain/errors/flash-sale-sku-not-found.error';
import { InvalidFlashSaleError } from '../../domain/errors/invalid-flash-sale.error';
import {
  FlashSaleResponse,
  PublicFlashSaleResponse,
  toFlashSaleResponse,
  toPublicFlashSaleResponse,
} from './flash-sale-response.mapper';
import { CreateFlashSaleRequestDto, UpdateFlashSaleRequestDto } from './dto/flash-sale-request.dto';
import { FlashSaleListStatus, ListFlashSalesQueryDto } from './dto/list-flash-sales-query.dto';

@Controller('api/flash-sales')
export class FlashSalesController {
  constructor(
    private readonly createFlashSale: CreateFlashSaleUseCase,
    private readonly updateFlashSale: UpdateFlashSaleUseCase,
    private readonly cancelFlashSale: CancelFlashSaleUseCase,
    private readonly getFlashSale: GetFlashSaleUseCase,
    private readonly listFlashSales: ListFlashSalesUseCase,
    private readonly scheduleFlashSale: ScheduleFlashSaleUseCase,
  ) {}

  @Get()
  async list(@Query() query: ListFlashSalesQueryDto): Promise<PublicFlashSaleResponse[]> {
    const status =
      query.status === FlashSaleListStatus.Active
        ? FlashSaleStatus.Active
        : FlashSaleStatus.Upcoming;
    const result = await this.listFlashSales.execute(status);
    const clock = { now: () => result.evaluatedAt };
    return result.flashSales.map((flashSale) => toPublicFlashSaleResponse(flashSale, clock));
  }

  @Post()
  async create(
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Body() body: CreateFlashSaleRequestDto,
  ): Promise<FlashSaleResponse> {
    try {
      const flashSale = await this.createFlashSale.execute({
        createdBy: parsePositiveId(userIdHeader, 'Administrator user ID'),
        name: body.name,
        description: body.description,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        items: body.items.map((item) => ({
          productSkuId: BigInt(item.productSkuId),
          salePrice: item.salePrice,
          stockLimit: item.stockLimit,
          maxQuantityPerUser: item.maxQuantityPerUser,
        })),
      });
      return toFlashSaleResponse(flashSale);
    } catch (error) {
      throw mapFlashSaleError(error);
    }
  }

  @Put(':flashSaleId')
  async update(
    @Param('flashSaleId', ParseIntPipe) flashSaleId: number,
    @Body() body: UpdateFlashSaleRequestDto,
  ): Promise<FlashSaleResponse> {
    try {
      const flashSale = await this.updateFlashSale.execute({
        flashSaleId: BigInt(flashSaleId),
        name: body.name,
        description: body.description,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        items: body.items.map((item) => ({
          productSkuId: BigInt(item.productSkuId),
          salePrice: item.salePrice,
          stockLimit: item.stockLimit,
          maxQuantityPerUser: item.maxQuantityPerUser,
        })),
      });
      return toFlashSaleResponse(flashSale);
    } catch (error) {
      throw mapFlashSaleError(error);
    }
  }

  @Post(':flashSaleId/cancel')
  async cancel(
    @Param('flashSaleId', ParseIntPipe) flashSaleId: number,
  ): Promise<FlashSaleResponse> {
    try {
      return toFlashSaleResponse(await this.cancelFlashSale.execute(BigInt(flashSaleId)));
    } catch (error) {
      throw mapFlashSaleError(error);
    }
  }

  @Post(':flashSaleId/schedule')
  async schedule(
    @Param('flashSaleId', ParseIntPipe) flashSaleId: number,
  ): Promise<FlashSaleResponse> {
    try {
      return toFlashSaleResponse(await this.scheduleFlashSale.execute(BigInt(flashSaleId)));
    } catch (error) {
      if (error instanceof FlashSaleNotDraftError) {
        throw new ConflictException({
          code: 'FLASH_SALE_NOT_SCHEDULABLE',
          message: error.message,
        });
      }
      throw mapFlashSaleError(error);
    }
  }

  @Get(':flashSaleId')
  async get(
    @Param('flashSaleId', ParseIntPipe) flashSaleId: number,
    @Headers('x-user-role') userRole: string | undefined,
  ): Promise<PublicFlashSaleResponse> {
    try {
      const flashSale = await this.getFlashSale.execute(BigInt(flashSaleId));
      if (
        userRole !== 'ADMIN' &&
        (flashSale.status === FlashSaleStatus.Draft ||
          flashSale.status === FlashSaleStatus.Cancelled)
      ) {
        throw new FlashSaleNotFoundError(BigInt(flashSaleId));
      }
      return toPublicFlashSaleResponse(flashSale);
    } catch (error) {
      throw mapFlashSaleError(error);
    }
  }
}

function parsePositiveId(value: string | undefined, field: string): bigint {
  if (!value || !/^\d+$/.test(value) || BigInt(value) <= 0n) {
    throw new BadRequestException(`${field} must be a positive integer.`);
  }
  return BigInt(value);
}

function mapFlashSaleError(error: unknown): Error {
  if (error instanceof FlashSaleNotFoundError || error instanceof FlashSaleSkuNotFoundError) {
    return new NotFoundException({
      code: error instanceof FlashSaleNotFoundError ? error.code : 'FLASH_SALE_NOT_FOUND',
      message: error.message,
    });
  }
  if (
    error instanceof FlashSaleNotDraftError ||
    error instanceof FlashSaleOverlapError ||
    error instanceof FlashSalePriceChangedError ||
    error instanceof FlashSaleProductInactiveError ||
    error instanceof FlashSaleSkuInactiveError
  ) {
    return new ConflictException({
      code: 'code' in error ? error.code : 'FLASH_SALE_NOT_SCHEDULABLE',
      message: error.message,
    });
  }
  if (error instanceof FlashSaleScheduleTimeError) {
    return new BadRequestException({ code: error.code, message: error.message });
  }
  if (error instanceof InvalidFlashSaleError) {
    const response = { code: error.code, message: error.message };
    return error.code === 'FLASH_SALE_NOT_SCHEDULABLE'
      ? new ConflictException(response)
      : new BadRequestException(response);
  }
  return error instanceof Error ? error : new Error('Unknown flash sale error.');
}
