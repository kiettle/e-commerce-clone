import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { CancelFlashSaleUseCase } from '../../application/use-cases/cancel-flash-sale.use-case';
import { CreateFlashSaleUseCase } from '../../application/use-cases/create-flash-sale.use-case';
import { GetFlashSaleUseCase } from '../../application/use-cases/get-flash-sale.use-case';
import { ScheduleFlashSaleUseCase } from '../../application/use-cases/schedule-flash-sale.use-case';
import { UpdateFlashSaleUseCase } from '../../application/use-cases/update-flash-sale.use-case';
import { FlashSaleNotDraftError } from '../../domain/errors/flash-sale-not-draft.error';
import { FlashSaleNotFoundError } from '../../domain/errors/flash-sale-not-found.error';
import { FlashSaleOverlapError } from '../../domain/errors/flash-sale-overlap.error';
import { FlashSalePriceChangedError } from '../../domain/errors/flash-sale-price-changed.error';
import { FlashSaleProductInactiveError } from '../../domain/errors/flash-sale-product-inactive.error';
import { FlashSaleScheduleTimeError } from '../../domain/errors/flash-sale-schedule-time.error';
import { FlashSaleSkuInactiveError } from '../../domain/errors/flash-sale-sku-inactive.error';
import { FlashSaleSkuNotFoundError } from '../../domain/errors/flash-sale-sku-not-found.error';
import { InvalidFlashSaleError } from '../../domain/errors/invalid-flash-sale.error';
import { FlashSaleResponse, toFlashSaleResponse } from './flash-sale-response.mapper';
import { CreateFlashSaleRequestDto, UpdateFlashSaleRequestDto } from './dto/flash-sale-request.dto';

@Controller('api/flash-sales')
export class FlashSalesController {
  constructor(
    private readonly createFlashSale: CreateFlashSaleUseCase,
    private readonly updateFlashSale: UpdateFlashSaleUseCase,
    private readonly cancelFlashSale: CancelFlashSaleUseCase,
    private readonly getFlashSale: GetFlashSaleUseCase,
    private readonly scheduleFlashSale: ScheduleFlashSaleUseCase,
  ) {}

  @Post()
  async create(@Body() body: CreateFlashSaleRequestDto): Promise<FlashSaleResponse> {
    try {
      const flashSale = await this.createFlashSale.execute({
        name: body.name,
        description: body.description,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        items: body.items.map((item) => ({
          productSkuId: BigInt(item.productSkuId),
          salePrice: item.salePrice,
          quantity: item.quantity,
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
          quantity: item.quantity,
        })),
      });
      return toFlashSaleResponse(flashSale);
    } catch (error) {
      throw mapFlashSaleError(error);
    }
  }

  @Delete(':flashSaleId')
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
      throw mapFlashSaleError(error);
    }
  }

  @Get(':flashSaleId')
  async get(@Param('flashSaleId', ParseIntPipe) flashSaleId: number): Promise<FlashSaleResponse> {
    try {
      return toFlashSaleResponse(await this.getFlashSale.execute(BigInt(flashSaleId)));
    } catch (error) {
      throw mapFlashSaleError(error);
    }
  }
}

function mapFlashSaleError(error: unknown): Error {
  if (error instanceof FlashSaleNotFoundError || error instanceof FlashSaleSkuNotFoundError) {
    return new NotFoundException(error.message);
  }
  if (
    error instanceof FlashSaleNotDraftError ||
    error instanceof FlashSaleOverlapError ||
    error instanceof FlashSalePriceChangedError ||
    error instanceof FlashSaleProductInactiveError ||
    error instanceof FlashSaleSkuInactiveError
  ) {
    return new ConflictException(error.message);
  }
  if (error instanceof InvalidFlashSaleError || error instanceof FlashSaleScheduleTimeError) {
    return new BadRequestException(error.message);
  }
  return error instanceof Error ? error : new Error('Unknown flash sale error.');
}
