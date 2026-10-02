export interface CategoryEntityProps {
  id: bigint;
  name: string;
  slug: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class CategoryEntity {
  readonly id: bigint;
  readonly name: string;
  readonly slug: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;

  constructor(props: CategoryEntityProps) {
    this.id = props.id;
    this.name = props.name;
    this.slug = props.slug;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
