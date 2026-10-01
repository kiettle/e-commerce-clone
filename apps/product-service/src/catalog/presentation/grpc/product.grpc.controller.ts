import { Controller, Logger } from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { CreateCategoryUseCase } from '../../application/use-cases/create-category.use-case';
import { CreateProductUseCase } from '../../application/use-cases/create-product.use-case';
import { DeleteProductUseCase } from '../../application/use-cases/delete-product.use-case';
import { GetProductSkuSnapshotUseCase } from '../../application/use-cases/get-product-sku-snapshot.use-case';
import { ListCategoriesUseCase } from '../../application/use-cases/list-categories.use-case';
import { SearchProductsUseCase } from '../../application/use-cases/search-products.use-case';
import { UpdateProductUseCase } from '../../application/use-cases/update-product.use-case';
import { ProductSkuStatus } from '../../domain/enums/product-sku-status.enum';
import { ProductStatus } from '../../domain/enums/product-status.enum';
import { CategoryEntity } from '../../domain/entities/category.entity';
import { ProductEntity } from '../../domain/entities/product.entity';
import { CategoryNotFoundError } from '../../domain/errors/category-not-found.error';
import { DuplicateSkuCodeError } from '../../domain/errors/duplicate-sku-code.error';
import { InvalidSkuCodeError } from '../../domain/errors/invalid-sku-code.error';
import { InvalidSkuQuantityError } from '../../domain/errors/invalid-sku-quantity.error';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';

interface CreateCategoryGrpcRequest {
  name?: string;
  slug?: string;
}

interface SearchProductsGrpcRequest {
  name?: string;
  category_id?: string;
}

interface ProductSkuGrpcRequest {
  sku_code?: string;
  price?: number;
  status?: string;
  quantity?: number;
}

interface CreateProductGrpcRequest {
  name?: string;
  description?: string;
  image_url?: string;
  category_id?: string;
  seller_id?: string;
  status?: string;
  skus?: ProductSkuGrpcRequest[];
}

interface UpdateProductGrpcRequest {
  product_id?: string;
  name?: string;
  description?: string;
  image_url?: string;
  category_id?: string;
  status?: string;
}

interface ProductIdGrpcRequest {
  product_id?: string;
}

interface ProductSkuSnapshotGrpcRequest {
  product_sku_id?: string;
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

interface ProductSkuSnapshotGrpcResponse {
  product_id: string;
  product_name: string;
  image_url?: string;
  product_sku_id: string;
  sku_code: string;
  regular_price: number;
  effective_price: number;
  price_source: string;
  flash_sale_id?: string;
  flash_sale_item_id?: string;
  sale_ends_at?: string;
  max_quantity_per_user?: number;
}

@Controller()
export class ProductGrpcController {
  private readonly logger = new Logger(ProductGrpcController.name);

  constructor(
    private readonly createCategoryUseCase: CreateCategoryUseCase,
    private readonly listCategoriesUseCase: ListCategoriesUseCase,
    private readonly createProductUseCase: CreateProductUseCase,
    private readonly searchProductsUseCase: SearchProductsUseCase,
    private readonly updateProductUseCase: UpdateProductUseCase,
    private readonly deleteProductUseCase: DeleteProductUseCase,
    private readonly getProductSkuSnapshotUseCase: GetProductSkuSnapshotUseCase,
  ) {}

  @GrpcMethod('ProductService', 'ListCategories')
  async listCategories(): Promise<{ categories: CategoryGrpcResponse[] }> {
    try {
      const categories = await this.listCategoriesUseCase.execute();
      return { categories: categories.map(toCategoryGrpcResponse) };
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  @GrpcMethod('ProductService', 'CreateCategory')
  async createCategory(request: CreateCategoryGrpcRequest): Promise<CategoryGrpcResponse> {
    try {
      const category = await this.createCategoryUseCase.execute({
        name: requiredText(request.name, 'name'),
        slug: optionalNonEmptyText(request.slug, 'slug'),
      });
      return toCategoryGrpcResponse(category);
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  @GrpcMethod('ProductService', 'SearchProducts')
  async searchProducts(
    request: SearchProductsGrpcRequest,
  ): Promise<{ products: ProductGrpcResponse[] }> {
    try {
      const products = await this.searchProductsUseCase.execute({
        name: optionalText(request.name),
        categoryId:
          request.category_id === undefined
            ? undefined
            : positiveBigInt(request.category_id, 'category_id'),
      });
      return { products: products.map(toProductGrpcResponse) };
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  @GrpcMethod('ProductService', 'CreateProduct')
  async createProduct(request: CreateProductGrpcRequest): Promise<ProductGrpcResponse> {
    try {
      const product = await this.createProductUseCase.execute({
        name: requiredText(request.name, 'name', 255),
        description: optionalText(request.description),
        imageUrl: optionalText(request.image_url),
        categoryId: positiveBigInt(request.category_id, 'category_id'),
        sellerId: positiveBigInt(request.seller_id, 'seller_id'),
        status: enumValue(request.status, ProductStatus, 'status'),
        skus: requiredItems(request.skus, 'skus').map((sku) => ({
          skuCode: requiredText(sku.sku_code, 'sku_code'),
          price: requiredNonNegativeNumber(sku.price, 'price'),
          status: enumValue(sku.status, ProductSkuStatus, 'sku status'),
          quantity: requiredNonNegativeInteger(sku.quantity, 'quantity'),
        })),
      });
      return toProductGrpcResponse(product);
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  @GrpcMethod('ProductService', 'UpdateProduct')
  async updateProduct(request: UpdateProductGrpcRequest): Promise<ProductGrpcResponse> {
    try {
      const product = await this.updateProductUseCase.execute({
        productId: positiveBigInt(request.product_id, 'product_id'),
        name: request.name === undefined ? undefined : requiredText(request.name, 'name', 255),
        description: optionalText(request.description),
        imageUrl: optionalText(request.image_url),
        categoryId:
          request.category_id === undefined
            ? undefined
            : positiveBigInt(request.category_id, 'category_id'),
        status:
          request.status === undefined
            ? undefined
            : enumValue(request.status, ProductStatus, 'status'),
      });
      return toProductGrpcResponse(product);
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  @GrpcMethod('ProductService', 'DeleteProduct')
  async deleteProduct(request: ProductIdGrpcRequest): Promise<ProductGrpcResponse> {
    try {
      const product = await this.deleteProductUseCase.execute(
        positiveBigInt(request.product_id, 'product_id'),
      );
      return toProductGrpcResponse(product);
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  @GrpcMethod('ProductService', 'GetProductSkuSnapshot')
  async getProductSkuSnapshot(
    request: ProductSkuSnapshotGrpcRequest,
  ): Promise<ProductSkuSnapshotGrpcResponse> {
    try {
      const productSkuId = positiveBigInt(request.product_sku_id, 'product_sku_id');
      const snapshot = await this.getProductSkuSnapshotUseCase.execute(productSkuId);

      if (!snapshot) {
        throw createRpcException(
          GrpcStatus.NOT_FOUND,
          `Product SKU ${productSkuId} was not found.`,
        );
      }

      return {
        product_id: snapshot.productId.toString(),
        product_name: snapshot.productName,
        ...(snapshot.imageUrl == null ? {} : { image_url: snapshot.imageUrl }),
        product_sku_id: snapshot.productSkuId.toString(),
        sku_code: snapshot.skuCode,
        regular_price: snapshot.regularPrice,
        effective_price: snapshot.effectivePrice,
        price_source: snapshot.priceSource,
        ...(snapshot.flashSaleId == null ? {} : { flash_sale_id: snapshot.flashSaleId.toString() }),
        ...(snapshot.flashSaleItemId == null
          ? {}
          : { flash_sale_item_id: snapshot.flashSaleItemId.toString() }),
        ...(snapshot.saleEndsAt == null ? {} : { sale_ends_at: snapshot.saleEndsAt.toISOString() }),
        ...(snapshot.maxPerUserQuantity == null
          ? {}
          : { max_quantity_per_user: snapshot.maxPerUserQuantity }),
      };
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }
      throw this.toRpcException(error);
    }
  }

  private toRpcException(error: unknown): RpcException {
    if (
      error instanceof InvalidGrpcRequestError ||
      error instanceof DuplicateSkuCodeError ||
      error instanceof InvalidSkuCodeError ||
      error instanceof InvalidSkuQuantityError
    ) {
      return createRpcException(GrpcStatus.INVALID_ARGUMENT, error.message);
    }

    if (error instanceof CategoryNotFoundError || error instanceof ProductNotFoundError) {
      return createRpcException(GrpcStatus.NOT_FOUND, error.message);
    }

    this.logger.error('Product gRPC request failed.', error);
    return createRpcException(GrpcStatus.UNAVAILABLE, 'Product service is unavailable.');
  }
}

class InvalidGrpcRequestError extends Error {}

function toCategoryGrpcResponse(category: CategoryEntity): CategoryGrpcResponse {
  return { id: category.id.toString(), name: category.name, slug: category.slug };
}

function toProductGrpcResponse(product: ProductEntity): ProductGrpcResponse {
  return {
    id: product.id.toString(),
    name: product.name,
    ...(product.description == null ? {} : { description: product.description }),
    ...(product.imageUrl == null ? {} : { image_url: product.imageUrl }),
    category_id: product.categoryId.toString(),
    seller_id: product.sellerId.toString(),
    status: product.status,
    skus: product.skus.map((sku) => ({
      id: sku.id.toString(),
      product_id: sku.productId.toString(),
      sku_code: sku.skuCode,
      price: sku.price,
      status: sku.status,
    })),
  };
}

function createRpcException(code: GrpcStatus, message: string): RpcException {
  return new RpcException({ code, message });
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

function requiredText(value: string | undefined, field: string, maxLength?: number): string {
  if (!value?.trim()) {
    throw new InvalidGrpcRequestError(`${field} must not be empty.`);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    throw new InvalidGrpcRequestError(`${field} must not exceed ${maxLength} characters.`);
  }
  return value;
}

function optionalText(value: string | undefined): string | undefined {
  return value === undefined ? undefined : value;
}

function optionalNonEmptyText(value: string | undefined, field: string): string | undefined {
  return value === undefined ? undefined : requiredText(value, field);
}

function requiredItems<T>(items: T[] | undefined, field: string): T[] {
  if (!items?.length) {
    throw new InvalidGrpcRequestError(`${field} must contain at least one item.`);
  }
  return items;
}

function requiredNonNegativeNumber(value: number | undefined, field: string): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    throw new InvalidGrpcRequestError(`${field} must be a non-negative number.`);
  }
  return value;
}

function requiredNonNegativeInteger(value: number | undefined, field: string): number {
  if (value === undefined || !Number.isInteger(value) || value < 0) {
    throw new InvalidGrpcRequestError(`${field} must be a non-negative integer.`);
  }
  return value;
}

function enumValue<T extends string>(
  value: string | undefined,
  values: Record<string, T>,
  field: string,
): T {
  if (!value || !Object.values(values).includes(value as T)) {
    throw new InvalidGrpcRequestError(`${field} is invalid.`);
  }
  return value as T;
}
