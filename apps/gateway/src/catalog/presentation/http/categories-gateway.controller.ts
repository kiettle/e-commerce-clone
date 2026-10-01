import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CatalogGatewayClient } from '../../infrastructure/grpc/catalog-gateway.client';
import {
  CategoryResponseDto,
  CreateCategoryRequestDto,
} from './dto/category.dto';

@ApiTags('catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/categories')
export class CategoriesGatewayController {
  constructor(private readonly catalogClient: CatalogGatewayClient) {}

  @Get()
  @ApiOperation({ summary: 'List categories through product-service' })
  @ApiOkResponse({ type: [CategoryResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  listCategories(): Promise<CategoryResponseDto[]> {
    return this.catalogClient.listCategories();
  }

  @Post()
  @ApiOperation({ summary: 'Create a category through product-service' })
  @ApiCreatedResponse({ type: CategoryResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid category payload.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  createCategory(
    @Body() body: CreateCategoryRequestDto,
  ): Promise<CategoryResponseDto> {
    return this.catalogClient.createCategory(body);
  }
}
