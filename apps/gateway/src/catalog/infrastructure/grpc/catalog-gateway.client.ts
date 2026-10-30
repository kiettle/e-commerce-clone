import { grpcDeadline, grpcTimeoutMs, grpcHttpError } from '@app/common';
import { Metadata, type CallOptions } from '@grpc/grpc-js';
import {
  BadGatewayException,
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientGrpc, ClientProxyFactory, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { Observable, firstValueFrom } from 'rxjs';
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
  GatewayFlashSaleStatus,
  ListFlashSalesQueryDto,
  PublicFlashSaleResponseDto,
  UpdateFlashSaleRequestDto,
} from '../../presentation/http/dto/flash-sale.dto';

interface CloseableClientGrpc extends ClientGrpc {
  close?: () => void;
}

interface CategoryGrpcResponse {
  id: string;
  name: string;
  slug: string;
}

interface ProductGrpcResponse {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  category_id: string;
  seller_id: string;
  status: string;
  skus: Array<{
    id: string;
    product_id: string;
    sku_code: string;
    price: number;
    status: string;
  }>;
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
    availability: 'AVAILABLE' | 'SOLD_OUT' | 'UNKNOWN';
    max_quantity_per_user: number;
  }>;
  created_at: string;
  updated_at: string;
}

interface CreateProductGrpcRequest {
  name: string;
  description?: string;
  image_url?: string;
  category_id: string;
  seller_id: string;
  status: string;
  skus: Array<{
    sku_code: string;
    price: number;
    status: string;
    quantity: number;
  }>;
}

interface UpdateProductGrpcRequest {
  product_id: string;
  name?: string;
  description?: string;
  image_url?: string;
  category_id?: string;
  status?: string;
}

interface FlashSaleItemGrpcRequest {
  product_sku_id: string;
  sale_price: number;
  stock_limit: number;
  max_quantity_per_user: number;
}

interface CreateFlashSaleGrpcRequest {
  created_by: string;
  name: string;
  description?: string;
  starts_at: string;
  ends_at: string;
  items: FlashSaleItemGrpcRequest[];
}

interface UpdateFlashSaleGrpcRequest {
  flash_sale_id: string;
  name: string;
  description?: string;
  description_is_null: boolean;
  starts_at: string;
  ends_at: string;
  items: FlashSaleItemGrpcRequest[];
}

interface ProductGrpcService {
  listCategories(
    request: Record<string, never>,
    metadata?: Metadata,
    options?: CallOptions,
  ): Observable<{ categories: CategoryGrpcResponse[] }>;
  createCategory(
    request: { name: string; slug?: string },
    metadata?: Metadata,
    options?: CallOptions,
  ): Observable<CategoryGrpcResponse>;
  searchProducts(
    request: {
      name?: string;
      category_id?: string;
    },
    metadata?: Metadata,
    options?: CallOptions,
  ): Observable<{ products?: ProductGrpcResponse[] }>;
  createProduct(
    request: CreateProductGrpcRequest,
    metadata?: Metadata,
    options?: CallOptions,
  ): Observable<ProductGrpcResponse>;
  updateProduct(
    request: UpdateProductGrpcRequest,
    metadata?: Metadata,
    options?: CallOptions,
  ): Observable<ProductGrpcResponse>;
  deleteProduct(
    request: { product_id: string },
    metadata?: Metadata,
    options?: CallOptions,
  ): Observable<ProductGrpcResponse>;
  createFlashSale(
    request: CreateFlashSaleGrpcRequest,
    metadata?: Metadata,
    options?: CallOptions,
  ): Observable<FlashSaleGrpcResponse>;
  listFlashSales(
    request: {
      status: string;
    },
    metadata?: Metadata,
    options?: CallOptions,
  ): Observable<{ flash_sales: PublicFlashSaleGrpcResponse[] }>;
  updateFlashSale(
    request: UpdateFlashSaleGrpcRequest,
    metadata?: Metadata,
    options?: CallOptions,
  ): Observable<FlashSaleGrpcResponse>;
  cancelFlashSale(
    request: { flash_sale_id: string },
    metadata?: Metadata,
    options?: CallOptions,
  ): Observable<FlashSaleGrpcResponse>;
  scheduleFlashSale(
    request: { flash_sale_id: string },
    metadata?: Metadata,
    options?: CallOptions,
  ): Observable<FlashSaleGrpcResponse>;
  getFlashSale(
    request: {
      flash_sale_id: string;
      user_role: string;
    },
    metadata?: Metadata,
    options?: CallOptions,
  ): Observable<PublicFlashSaleGrpcResponse>;
}

@Injectable()
export class CatalogGatewayClient implements OnModuleInit, OnApplicationShutdown {
  private client?: CloseableClientGrpc;
  private productService?: ProductGrpcService;

  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.timeoutMs = grpcTimeoutMs(configService.get('GRPC_REQUEST_TIMEOUT_MS', 5000));
  }

  onModuleInit(): void {
    this.client = this.createClient();
    this.productService = this.client.getService<ProductGrpcService>('ProductService');
  }

  onApplicationShutdown(): void {
    this.client?.close?.();
  }

  async listCategories(): Promise<CategoryResponseDto[]> {
    const response = await this.call(
      this.getProductService().listCategories({}, new Metadata(), grpcDeadline(this.timeoutMs)),
    );
    return response.categories.map(toCategoryResponse);
  }

  async createCategory(body: CreateCategoryRequestDto): Promise<CategoryResponseDto> {
    const response = await this.call(
      this.getProductService().createCategory(
        {
          name: body.name,
          ...(body.slug === undefined ? {} : { slug: body.slug }),
        },
        new Metadata(),
        grpcDeadline(this.timeoutMs),
      ),
    );
    return toCategoryResponse(response);
  }

  async searchProducts(query: SearchProductsQueryDto): Promise<ProductResponseDto[]> {
    const response = await this.call(
      this.getProductService().searchProducts(
        {
          ...(query.name === undefined ? {} : { name: query.name }),
          ...(query.categoryId === undefined ? {} : { category_id: String(query.categoryId) }),
        },
        new Metadata(),
        grpcDeadline(this.timeoutMs),
      ),
    );
    return (response.products ?? []).map(toProductResponse);
  }

  async createProduct(body: CreateProductRequestDto): Promise<ProductResponseDto> {
    const response = await this.call(
      this.getProductService().createProduct(
        {
          name: body.name,
          ...(body.description === undefined ? {} : { description: body.description }),
          ...(body.imageUrl === undefined ? {} : { image_url: body.imageUrl }),
          category_id: String(body.categoryId),
          seller_id: String(body.sellerId),
          status: body.status,
          skus: body.skus.map((sku) => ({
            sku_code: sku.skuCode,
            price: sku.price,
            status: sku.status,
            quantity: sku.quantity,
          })),
        },
        new Metadata(),
        grpcDeadline(this.timeoutMs),
      ),
    );
    return toProductResponse(response);
  }

  async updateProduct(
    productId: number,
    body: UpdateProductRequestDto,
  ): Promise<ProductResponseDto> {
    const response = await this.call(
      this.getProductService().updateProduct(
        {
          product_id: String(productId),
          ...(body.name === undefined ? {} : { name: body.name }),
          ...(body.description === undefined ? {} : { description: body.description }),
          ...(body.imageUrl === undefined ? {} : { image_url: body.imageUrl }),
          ...(body.categoryId === undefined ? {} : { category_id: String(body.categoryId) }),
          ...(body.status === undefined ? {} : { status: body.status }),
        },
        new Metadata(),
        grpcDeadline(this.timeoutMs),
      ),
    );
    return toProductResponse(response);
  }

  async deleteProduct(productId: number): Promise<ProductResponseDto> {
    const response = await this.call(
      this.getProductService().deleteProduct(
        { product_id: String(productId) },
        new Metadata(),
        grpcDeadline(this.timeoutMs),
      ),
    );
    return toProductResponse(response);
  }

  async createFlashSale(
    body: CreateFlashSaleRequestDto,
    userId: number,
  ): Promise<FlashSaleResponseDto> {
    const response = await this.call(
      this.getProductService().createFlashSale(
        {
          created_by: String(userId),
          name: body.name,
          ...(body.description == null ? {} : { description: body.description }),
          starts_at: body.startsAt,
          ends_at: body.endsAt,
          items: body.items.map(toFlashSaleItemRequest),
        },
        new Metadata(),
        grpcDeadline(this.timeoutMs),
      ),
    );
    return toFlashSaleResponse(response);
  }

  async listFlashSales(query: ListFlashSalesQueryDto): Promise<PublicFlashSaleResponseDto[]> {
    const response = await this.call(
      this.getProductService().listFlashSales(
        { status: query.status },
        new Metadata(),
        grpcDeadline(this.timeoutMs),
      ),
    );
    return response.flash_sales.map(toPublicFlashSaleResponse);
  }

  async updateFlashSale(
    flashSaleId: number,
    body: UpdateFlashSaleRequestDto,
  ): Promise<FlashSaleResponseDto> {
    const response = await this.call(
      this.getProductService().updateFlashSale(
        {
          flash_sale_id: String(flashSaleId),
          name: body.name,
          ...(body.description == null ? {} : { description: body.description }),
          description_is_null: body.description === null,
          starts_at: body.startsAt,
          ends_at: body.endsAt,
          items: body.items.map(toFlashSaleItemRequest),
        },
        new Metadata(),
        grpcDeadline(this.timeoutMs),
      ),
    );
    return toFlashSaleResponse(response);
  }

  async cancelFlashSale(flashSaleId: number): Promise<FlashSaleResponseDto> {
    const response = await this.call(
      this.getProductService().cancelFlashSale(
        { flash_sale_id: String(flashSaleId) },
        new Metadata(),
        grpcDeadline(this.timeoutMs),
      ),
    );
    return toFlashSaleResponse(response);
  }

  async getFlashSale(flashSaleId: number, role: string): Promise<PublicFlashSaleResponseDto> {
    const response = await this.call(
      this.getProductService().getFlashSale(
        {
          flash_sale_id: String(flashSaleId),
          user_role: role,
        },
        new Metadata(),
        grpcDeadline(this.timeoutMs),
      ),
    );
    return toPublicFlashSaleResponse(response);
  }

  async scheduleFlashSale(flashSaleId: number): Promise<FlashSaleResponseDto> {
    const response = await this.call(
      this.getProductService().scheduleFlashSale(
        { flash_sale_id: String(flashSaleId) },
        new Metadata(),
        grpcDeadline(this.timeoutMs),
      ),
    );
    return toFlashSaleResponse(response);
  }

  protected createClient(): CloseableClientGrpc {
    return ClientProxyFactory.create({
      transport: Transport.GRPC,
      options: {
        package: 'product',
        protoPath: join(process.cwd(), 'libs/proto/product.proto'),
        url: this.configService.get<string>('PRODUCT_GRPC_URL') ?? 'localhost:9001',
        loader: {
          keepCase: true,
          longs: String,
        },
      },
    }) as CloseableClientGrpc;
  }

  private getProductService(): ProductGrpcService {
    if (!this.productService) {
      throw new ServiceUnavailableException('Product gRPC client is not initialized.');
    }
    return this.productService;
  }

  private async call<T>(operation: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(operation);
    } catch (error) {
      throw grpcHttpError(error, 'Product service');
    }
  }
}

function toCategoryResponse(response: CategoryGrpcResponse): CategoryResponseDto {
  return { id: toPublicId(response.id), name: response.name, slug: response.slug };
}

function toProductResponse(response: ProductGrpcResponse): ProductResponseDto {
  return {
    id: toPublicId(response.id),
    name: response.name,
    description: response.description ?? null,
    imageUrl: response.image_url ?? null,
    categoryId: toPublicId(response.category_id),
    sellerId: toPublicId(response.seller_id),
    status: response.status,
    skus: response.skus.map((sku) => ({
      id: toPublicId(sku.id),
      productId: toPublicId(sku.product_id),
      skuCode: sku.sku_code,
      price: sku.price,
      status: sku.status,
    })),
  };
}

function toFlashSaleResponse(response: FlashSaleGrpcResponse): FlashSaleResponseDto {
  return {
    id: toPublicId(response.id),
    name: response.name,
    description: response.description ?? null,
    startsAt: response.starts_at,
    endsAt: response.ends_at,
    status: response.status as GatewayFlashSaleStatus,
    items: response.items.map((item) => ({
      id: toPublicId(item.id),
      productSkuId: toPublicId(item.product_sku_id),
      originalPrice: item.original_price,
      salePrice: item.sale_price,
      stockLimit: item.stock_limit,
      maxQuantityPerUser: item.max_quantity_per_user,
    })),
    createdAt: response.created_at,
    updatedAt: response.updated_at,
  };
}

function toPublicFlashSaleResponse(
  response: PublicFlashSaleGrpcResponse,
): PublicFlashSaleResponseDto {
  return {
    id: toPublicId(response.id),
    name: response.name,
    description: response.description ?? null,
    startsAt: response.starts_at,
    endsAt: response.ends_at,
    status: response.status as GatewayFlashSaleStatus,
    items: response.items.map((item) => ({
      id: toPublicId(item.id),
      productSkuId: toPublicId(item.product_sku_id),
      productName: item.product_name,
      imageUrl: item.image_url ?? null,
      originalPrice: item.original_price,
      salePrice: item.sale_price,
      availability: item.availability,
      maxQuantityPerUser: item.max_quantity_per_user,
    })),
    createdAt: response.created_at,
    updatedAt: response.updated_at,
  };
}

function toFlashSaleItemRequest(item: {
  productSkuId: number;
  salePrice: number;
  stockLimit: number;
  maxQuantityPerUser: number;
}): FlashSaleItemGrpcRequest {
  return {
    product_sku_id: String(item.productSkuId),
    sale_price: item.salePrice,
    stock_limit: item.stockLimit,
    max_quantity_per_user: item.maxQuantityPerUser,
  };
}

function toPublicId(value: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0) {
    throw new BadGatewayException('Product service returned an invalid identifier.');
  }
  return result;
}
