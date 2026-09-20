export const PRODUCT_EVENT_TRANSPORT = Symbol('PRODUCT_EVENT_TRANSPORT');

export interface ProductEvent {
  id: string;
  aggregateId: bigint;
  eventType: string;
  schemaVersion: number;
  partitionKey: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
}

export interface ProductEventTransportPort {
  publish(event: ProductEvent): Promise<void>;
}
