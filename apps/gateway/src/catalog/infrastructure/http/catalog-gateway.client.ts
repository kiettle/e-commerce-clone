import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DownstreamHttpClient } from '../../../common/http/downstream-http.client';
import {
  CategoryResponseDto,
  CreateCategoryRequestDto,
} from '../../presentation/http/dto/category.dto';
import {
  CreateProductRequestDto,
  ProductResponseDto,
  SearchProductsQueryDto,
  UpdateProductRequestDto,
} from '../../presentation/http/dto/product.dto';
import {
  CreateFlashSaleRequestDto,
  FlashSaleResponseDto,
  UpdateFlashSaleRequestDto,
} from '../../presentation/http/dto/flash-sale.dto';

@Injectable()
export class CatalogGatewayClient {
  constructor(
    private readonly configService: ConfigService,
    private readonly httpClient: DownstreamHttpClient,
  ) {}

  listCategories(): Promise<CategoryResponseDto[]> {
    return this.httpClient.request<CategoryResponseDto[]>({
      serviceName: 'product-service',
      baseUrl: this.getProductServiceUrl(),
      path: '/api/categories',
      method: 'GET',
    });
  }

  createCategory(body: CreateCategoryRequestDto): Promise<CategoryResponseDto> {
    return this.httpClient.request<CategoryResponseDto>({
      serviceName: 'product-service',
      baseUrl: this.getProductServiceUrl(),
      path: '/api/categories',
      method: 'POST',
      body,
    });
  }

  searchProducts(query: SearchProductsQueryDto): Promise<ProductResponseDto[]> {
    return this.httpClient.request<ProductResponseDto[]>({
      serviceName: 'product-service',
      baseUrl: this.getProductServiceUrl(),
      path: '/api/products',
      method: 'GET',
      query: {
        name: query.name,
        categoryId: query.categoryId,
      },
    });
  }

  createProduct(body: CreateProductRequestDto): Promise<ProductResponseDto> {
    return this.httpClient.request<ProductResponseDto>({
      serviceName: 'product-service',
      baseUrl: this.getProductServiceUrl(),
      path: '/api/products',
      method: 'POST',
      body,
    });
  }

  updateProduct(productId: number, body: UpdateProductRequestDto): Promise<ProductResponseDto> {
    return this.httpClient.request<ProductResponseDto>({
      serviceName: 'product-service',
      baseUrl: this.getProductServiceUrl(),
      path: `/api/products/${productId}`,
      method: 'PUT',
      body,
    });
  }

  deleteProduct(productId: number): Promise<ProductResponseDto> {
    return this.httpClient.request<ProductResponseDto>({
      serviceName: 'product-service',
      baseUrl: this.getProductServiceUrl(),
      path: `/api/products/${productId}`,
      method: 'DELETE',
    });
  }

  createFlashSale(body: CreateFlashSaleRequestDto): Promise<FlashSaleResponseDto> {
    return this.httpClient.request<FlashSaleResponseDto>({
      serviceName: 'product-service',
      baseUrl: this.getProductServiceUrl(),
      path: '/api/flash-sales',
      method: 'POST',
      body,
    });
  }

  updateFlashSale(
    flashSaleId: number,
    body: UpdateFlashSaleRequestDto,
  ): Promise<FlashSaleResponseDto> {
    return this.httpClient.request<FlashSaleResponseDto>({
      serviceName: 'product-service',
      baseUrl: this.getProductServiceUrl(),
      path: `/api/flash-sales/${flashSaleId}`,
      method: 'PUT',
      body,
    });
  }

  cancelFlashSale(flashSaleId: number): Promise<FlashSaleResponseDto> {
    return this.httpClient.request<FlashSaleResponseDto>({
      serviceName: 'product-service',
      baseUrl: this.getProductServiceUrl(),
      path: `/api/flash-sales/${flashSaleId}`,
      method: 'DELETE',
    });
  }

  getFlashSale(flashSaleId: number): Promise<FlashSaleResponseDto> {
    return this.httpClient.request<FlashSaleResponseDto>({
      serviceName: 'product-service',
      baseUrl: this.getProductServiceUrl(),
      path: `/api/flash-sales/${flashSaleId}`,
      method: 'GET',
    });
  }

  private getProductServiceUrl(): string {
    const explicitUrl = this.configService.get<string>('PRODUCT_SERVICE_URL');

    if (explicitUrl) {
      return explicitUrl;
    }

    const port = this.configService.get<string>('PRODUCT_SERVICE_PORT') ?? '4001';

    return `http://localhost:${port}`;
  }
}
