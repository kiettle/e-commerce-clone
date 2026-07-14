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
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CatalogGatewayClient } from '../../infrastructure/http/catalog-gateway.client';
import {
  CreateProductRequestDto,
  ProductResponseDto,
  SearchProductsQueryDto,
  UpdateProductRequestDto,
} from './dto/product.dto';

@ApiTags('catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/products')
export class ProductsGatewayController {
  constructor(private readonly catalogClient: CatalogGatewayClient) {}

  @Get()
  @ApiOperation({ summary: 'Search products through product-service' })
  @ApiOkResponse({ type: [ProductResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  searchProducts(
    @Query() query: SearchProductsQueryDto,
  ): Promise<ProductResponseDto[]> {
    return this.catalogClient.searchProducts(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a product through product-service' })
  @ApiCreatedResponse({ type: ProductResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid product payload.' })
  @ApiNotFoundResponse({ description: 'Category not found.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  createProduct(
    @Body() body: CreateProductRequestDto,
  ): Promise<ProductResponseDto> {
    return this.catalogClient.createProduct(body);
  }

  @Put(':productId')
  @ApiOperation({ summary: 'Update a product through product-service' })
  @ApiParam({ name: 'productId', example: 1, type: Number })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid product payload.' })
  @ApiNotFoundResponse({ description: 'Product or category not found.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  updateProduct(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() body: UpdateProductRequestDto,
  ): Promise<ProductResponseDto> {
    return this.catalogClient.updateProduct(productId, body);
  }

  @Delete(':productId')
  @ApiOperation({ summary: 'Delete a product through product-service' })
  @ApiParam({ name: 'productId', example: 1, type: Number })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse({ description: 'Product not found.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  deleteProduct(
    @Param('productId', ParseIntPipe) productId: number,
  ): Promise<ProductResponseDto> {
    return this.catalogClient.deleteProduct(productId);
  }
}

