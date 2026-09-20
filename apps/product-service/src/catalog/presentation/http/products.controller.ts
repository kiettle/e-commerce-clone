import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CreateProductUseCase } from '../../application/use-cases/create-product.use-case';
import { DeleteProductUseCase } from '../../application/use-cases/delete-product.use-case';
import { SearchProductsUseCase } from '../../application/use-cases/search-products.use-case';
import { UpdateProductUseCase } from '../../application/use-cases/update-product.use-case';
import { CategoryNotFoundError } from '../../domain/errors/category-not-found.error';
import { DuplicateSkuCodeError } from '../../domain/errors/duplicate-sku-code.error';
import { InvalidSkuCodeError } from '../../domain/errors/invalid-sku-code.error';
import { InvalidSkuQuantityError } from '../../domain/errors/invalid-sku-quantity.error';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';
import { ProductResponse, toProductResponse } from './catalog-response.mapper';
import { CreateProductRequestDto } from './dto/create-product-request.dto';
import { SearchProductsQueryDto } from './dto/search-products-query.dto';
import { UpdateProductRequestDto } from './dto/update-product-request.dto';

@Controller('api/products')
export class ProductsController {
  constructor(
    private readonly createProductUseCase: CreateProductUseCase,
    private readonly searchProductsUseCase: SearchProductsUseCase,
    private readonly updateProductUseCase: UpdateProductUseCase,
    private readonly deleteProductUseCase: DeleteProductUseCase,
  ) {}

  @Get()
  async searchProducts(@Query() query: SearchProductsQueryDto): Promise<ProductResponse[]> {
    const products = await this.searchProductsUseCase.execute({
      name: query.name,
      categoryId: query.categoryId === undefined ? undefined : BigInt(query.categoryId),
    });

    return products.map(toProductResponse);
  }

  @Post()
  async createProduct(@Body() body: CreateProductRequestDto): Promise<ProductResponse> {
    try {
      const product = await this.createProductUseCase.execute({
        name: body.name,
        description: body.description,
        imageUrl: body.imageUrl,
        categoryId: BigInt(body.categoryId),
        sellerId: BigInt(body.sellerId),
        status: body.status,
        skus: body.skus,
      });

      return toProductResponse(product);
    } catch (error) {
      throw mapCatalogError(error);
    }
  }

  @Put(':productId')
  async updateProduct(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() body: UpdateProductRequestDto,
  ): Promise<ProductResponse> {
    try {
      const product = await this.updateProductUseCase.execute({
        productId: BigInt(productId),
        name: body.name,
        description: body.description,
        imageUrl: body.imageUrl,
        categoryId: body.categoryId === undefined ? undefined : BigInt(body.categoryId),
        status: body.status,
      });

      return toProductResponse(product);
    } catch (error) {
      throw mapCatalogError(error);
    }
  }

  @Delete(':productId')
  async deleteProduct(
    @Param('productId', ParseIntPipe) productId: number,
  ): Promise<ProductResponse> {
    try {
      const product = await this.deleteProductUseCase.execute(BigInt(productId));

      return toProductResponse(product);
    } catch (error) {
      throw mapCatalogError(error);
    }
  }
}

function mapCatalogError(error: unknown): Error {
  if (error instanceof CategoryNotFoundError || error instanceof ProductNotFoundError) {
    return new NotFoundException(error.message);
  }

  if (
    error instanceof DuplicateSkuCodeError ||
    error instanceof InvalidSkuCodeError ||
    error instanceof InvalidSkuQuantityError
  ) {
    return new BadRequestException(error.message);
  }

  return error instanceof Error ? error : new Error('Unknown catalog error.');
}
