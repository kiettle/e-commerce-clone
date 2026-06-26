import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateCategoryUseCase } from '../../application/use-cases/create-category.use-case';
import { ListCategoriesUseCase } from '../../application/use-cases/list-categories.use-case';
import {
  CategoryResponse,
  toCategoryResponse,
} from './catalog-response.mapper';
import { CreateCategoryRequestDto } from './dto/create-category-request.dto';

@Controller('api/categories')
export class CategoriesController {
  constructor(
    private readonly createCategoryUseCase: CreateCategoryUseCase,
    private readonly listCategoriesUseCase: ListCategoriesUseCase,
  ) {}

  @Get()
  async listCategories(): Promise<CategoryResponse[]> {
    const categories = await this.listCategoriesUseCase.execute();

    return categories.map(toCategoryResponse);
  }

  @Post()
  async createCategory(
    @Body() body: CreateCategoryRequestDto,
  ): Promise<CategoryResponse> {
    const category = await this.createCategoryUseCase.execute(body);

    return toCategoryResponse(category);
  }
}
