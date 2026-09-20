export enum CheckoutStatus {
  Started = 'STARTED',
  StockReserved = 'STOCK_RESERVED',
  OrderConfirmed = 'ORDER_CONFIRMED',
  StockCommitted = 'STOCK_COMMITTED',
  Completed = 'COMPLETED',
  Compensating = 'COMPENSATING',
  Failed = 'FAILED',
  ReconciliationRequired = 'RECONCILIATION_REQUIRED',
}
