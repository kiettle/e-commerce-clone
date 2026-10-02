import { FlashSaleStatus } from '../enums/flash-sale-status.enum';
import { FlashSaleNotDraftError } from '../errors/flash-sale-not-draft.error';
import { InvalidFlashSaleError } from '../errors/invalid-flash-sale.error';
import { Clock } from '../services/clock';
import { FlashSaleItemEntity } from './flash-sale-item.entity';

export interface FlashSaleEntityProps {
  id?: bigint;
  name: string;
  description?: string | null;
  startsAt: Date;
  endsAt: Date;
  status?: FlashSaleStatus;
  createdBy?: bigint | null;
  items?: FlashSaleItemEntity[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FlashSaleChanges {
  name?: string;
  description?: string | null;
  startsAt?: Date;
  endsAt?: Date;
  items?: FlashSaleItemEntity[];
}

const storedStatuses = new Set<FlashSaleStatus>([
  FlashSaleStatus.Draft,
  FlashSaleStatus.Scheduled,
  FlashSaleStatus.Cancelled,
]);

export class FlashSaleEntity {
  readonly id?: bigint;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
  readonly createdBy: bigint | null;

  private currentName: string;
  private currentDescription: string | null;
  private currentStartsAt: Date;
  private currentEndsAt: Date;
  private currentStatus: FlashSaleStatus;
  private currentItems: FlashSaleItemEntity[];

  constructor(props: FlashSaleEntityProps) {
    const status = props.status ?? FlashSaleStatus.Draft;
    this.validateStoredStatus(status);
    this.validateWindow(props.startsAt, props.endsAt);
    this.validateItems(props.items ?? []);

    this.id = props.id;
    this.currentName = props.name;
    this.currentDescription = props.description ?? null;
    this.currentStartsAt = new Date(props.startsAt.getTime());
    this.currentEndsAt = new Date(props.endsAt.getTime());
    this.currentStatus = status;
    this.createdBy = props.createdBy ?? null;
    this.currentItems = [...(props.items ?? [])];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  get name(): string {
    return this.currentName;
  }

  get startsAt(): Date {
    return new Date(this.currentStartsAt.getTime());
  }

  get description(): string | null {
    return this.currentDescription;
  }

  get endsAt(): Date {
    return new Date(this.currentEndsAt.getTime());
  }

  get status(): FlashSaleStatus {
    return this.currentStatus;
  }

  get items(): readonly FlashSaleItemEntity[] {
    return [...this.currentItems];
  }

  getEffectiveStatus(clock: Clock): FlashSaleStatus {
    if (this.currentStatus !== FlashSaleStatus.Scheduled) {
      return this.currentStatus;
    }

    const now = clock.now().getTime();
    if (!Number.isFinite(now)) {
      throw new InvalidFlashSaleError('Clock returned an invalid date.');
    }
    if (now < this.currentStartsAt.getTime()) {
      return FlashSaleStatus.Upcoming;
    }
    if (now >= this.currentEndsAt.getTime()) {
      return FlashSaleStatus.Ended;
    }
    return FlashSaleStatus.Active;
  }

  update(changes: FlashSaleChanges): void {
    this.ensureDraft();

    const startsAt = changes.startsAt ?? this.currentStartsAt;
    const endsAt = changes.endsAt ?? this.currentEndsAt;
    const items = changes.items ?? this.currentItems;
    this.validateWindow(startsAt, endsAt);
    this.validateItems(items);

    this.currentName = changes.name ?? this.currentName;
    if (changes.description !== undefined) {
      this.currentDescription = changes.description;
    }
    this.currentStartsAt = new Date(startsAt.getTime());
    this.currentEndsAt = new Date(endsAt.getTime());
    this.currentItems = [...items];
  }

  schedule(): void {
    this.ensureDraft();
    if (this.currentItems.length === 0) {
      throw new InvalidFlashSaleError('A flash sale must have an item before scheduling.');
    }
    if (this.currentItems.length > 100) {
      throw new InvalidFlashSaleError('A flash sale cannot contain more than 100 items.');
    }
    this.currentStatus = FlashSaleStatus.Scheduled;
  }

  cancel(): void {
    this.ensureDraft();
    this.currentStatus = FlashSaleStatus.Cancelled;
  }

  private ensureDraft(): void {
    if (this.currentStatus !== FlashSaleStatus.Draft) {
      throw new FlashSaleNotDraftError();
    }
  }

  private validateWindow(startsAt: Date, endsAt: Date): void {
    const start = startsAt.getTime();
    const end = endsAt.getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      throw new InvalidFlashSaleError(
        'Flash sale start time must be before its end time.',
        'FLASH_SALE_TIME_INVALID',
      );
    }
  }

  private validateItems(items: readonly FlashSaleItemEntity[]): void {
    const skuIds = new Set<string>();
    for (const item of items) {
      const skuId = item.productSkuId.toString();
      if (skuIds.has(skuId)) {
        throw new InvalidFlashSaleError(
          'A product SKU can appear only once in a flash sale.',
          'FLASH_SALE_SKU_DUPLICATE',
        );
      }
      skuIds.add(skuId);
    }
  }

  private validateStoredStatus(status: FlashSaleStatus): void {
    if (!storedStatuses.has(status)) {
      throw new InvalidFlashSaleError(`${status} is an effective status and cannot be stored.`);
    }
  }
}
