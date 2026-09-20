import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
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
  UpdateFlashSaleRequestDto,
} from './dto/flash-sale.dto';

@ApiTags('flash sales')
@ApiBearerAuth()
@Roles(UserRole.Admin)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/flash-sales')
export class FlashSalesGatewayController {
  constructor(private readonly catalogClient: CatalogGatewayClient) {}

  @Post()
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

  @Get(':flashSaleId')
  @ApiOperation({ summary: 'Get a flash sale, including cancelled sales' })
  @ApiParam({ name: 'flashSaleId', example: 1, type: Number })
  @ApiOkResponse({ type: FlashSaleResponseDto })
  @ApiNotFoundResponse({ description: 'Flash sale not found.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  @ApiForbiddenResponse({ description: 'Administrator role required.' })
  get(@Param('flashSaleId', ParseIntPipe) flashSaleId: number): Promise<FlashSaleResponseDto> {
    return this.catalogClient.getFlashSale(flashSaleId);
  }
}
