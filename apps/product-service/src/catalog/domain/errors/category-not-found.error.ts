export class CategoryNotFoundError extends Error {
  constructor(categoryId: bigint) {
    super(`Category ${categoryId.toString()} was not found.`);
  }
}
