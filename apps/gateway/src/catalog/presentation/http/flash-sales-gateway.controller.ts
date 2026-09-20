import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CatalogGatewayClient } from '../../infrastructure/http/catalog-gateway.client';
import {
  CreateFlashSaleRequestDto,
  FlashSaleResponseDto,
  ListFlashSalesQueryDto,
  PublicFlashSaleResponseDto,
  UpdateFlashSaleRequestDto,
} from './dto/flash-sale.dto';

@ApiTags('flash sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/flash-sales')
export class FlashSalesGatewayController {
  constructor(private readonly catalogClient: CatalogGatewayClient) {}

  @Get()
  @ApiOperation({ summary: 'List active or upcoming flash sales' })
  @ApiOkResponse({ type: [PublicFlashSaleResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  list(@Query() query: ListFlashSalesQueryDto): Promise<PublicFlashSaleResponseDto[]> {
    return this.catalogClient.listFlashSales(query);
  }

  @Post()
  @Roles(UserRole.Admin)
  @ApiOperation({ summary: 'Create a flash-sale draft' })
  @ApiCreatedResponse({ type: FlashSaleResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid draft, item, price, quantity, or time window.' })
  @ApiNotFoundResponse({ description: 'A referenced product SKU was not found.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  @ApiForbiddenResponse({ description: 'Administrator role required.' })
  create(@Body() body: CreateFlashSaleRequestDto): Promise<FlashSaleResponseDto> {
    return this.catalogClient.createFlashSale(body);
  }

  @Put(':flashSaleId')
  @Roles(UserRole.Admin)
  @ApiOperation({ summary: 'Replace a flash-sale draft' })
  @ApiParam({ name: 'flashSaleId', example: 1, type: Number })
  @ApiOkResponse({ type: FlashSaleResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid draft, item, price, quantity, or time window.' })
  @ApiNotFoundResponse({ description: 'The flash sale or a referenced SKU was not found.' })
  @ApiConflictResponse({ description: 'Only a draft flash sale can be updated.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  @ApiForbiddenResponse({ description: 'Administrator role required.' })
  update(
    @Param('flashSaleId', ParseIntPipe) flashSaleId: number,
    @Body() body: UpdateFlashSaleRequestDto,
  ): Promise<FlashSaleResponseDto> {
    return this.catalogClient.updateFlashSale(flashSaleId, body);
  }

  @Delete(':flashSaleId')
  @Roles(UserRole.Admin)
  @ApiOperation({ summary: 'Cancel a flash-sale draft' })
  @ApiParam({ name: 'flashSaleId', example: 1, type: Number })
  @ApiOkResponse({ type: FlashSaleResponseDto })
  @ApiNotFoundResponse({ description: 'Flash sale not found.' })
  @ApiConflictResponse({ description: 'Only a draft flash sale can be cancelled.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  @ApiForbiddenResponse({ description: 'Administrator role required.' })
  cancel(@Param('flashSaleId', ParseIntPipe) flashSaleId: number): Promise<FlashSaleResponseDto> {
    return this.catalogClient.cancelFlashSale(flashSaleId);
  }

  @Post(':flashSaleId/schedule')
  @Roles(UserRole.Admin)
  @ApiOperation({ summary: 'Schedule a flash-sale draft atomically' })
  @ApiParam({ name: 'flashSaleId', example: 1, type: Number })
  @ApiOkResponse({ type: FlashSaleResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid scheduling lead time or duration.' })
  @ApiNotFoundResponse({ description: 'Flash sale not found.' })
  @ApiConflictResponse({
    description:
      'Sale is not a draft, a product or SKU is inactive, FLASH_SALE_PRICE_CHANGED, or the sale overlaps.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  @ApiForbiddenResponse({ description: 'Administrator role required.' })
  schedule(@Param('flashSaleId', ParseIntPipe) flashSaleId: number): Promise<FlashSaleResponseDto> {
    return this.catalogClient.scheduleFlashSale(flashSaleId);
  }

  @Get(':flashSaleId')
  @ApiOperation({ summary: 'Get a flash sale, including cancelled sales' })
  @ApiParam({ name: 'flashSaleId', example: 1, type: Number })
  @ApiOkResponse({ type: PublicFlashSaleResponseDto })
  @ApiNotFoundResponse({ description: 'Flash sale not found.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  get(
    @Param('flashSaleId', ParseIntPipe) flashSaleId: number,
  ): Promise<PublicFlashSaleResponseDto> {
    return this.catalogClient.getFlashSale(flashSaleId);
  }
}
