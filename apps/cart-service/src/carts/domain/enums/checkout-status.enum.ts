export enum CheckoutStatus {
  Started = 'STARTED',
  StockReserved = 'STOCK_RESERVED',
  OrderConfirmed = 'ORDER_CONFIRMED',
  Completed = 'COMPLETED',
  Compensating = 'COMPENSATING',
  Failed = 'FAILED',
  ReconciliationRequired = 'RECONCILIATION_REQUIRED',
}
