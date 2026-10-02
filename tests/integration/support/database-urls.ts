export interface IntegrationDatabaseUrls {
  auth: string;
  product: string;
  inventory: string;
  cart: string;
  order: string;
}

export function readIntegrationDatabaseUrls(): IntegrationDatabaseUrls {
  return {
    auth: readTestDatabaseUrl('AUTH_INTEGRATION_DATABASE_URL'),
    product: readTestDatabaseUrl('PRODUCT_INTEGRATION_DATABASE_URL'),
    inventory: readTestDatabaseUrl('INVENTORY_INTEGRATION_DATABASE_URL'),
    cart: readTestDatabaseUrl('CART_INTEGRATION_DATABASE_URL'),
    order: readTestDatabaseUrl('ORDER_INTEGRATION_DATABASE_URL'),
  };
}

export function readTestDatabaseUrl(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. Run tests through npm run test:integration.`);
  }

  const url = new URL(value);
  const databaseName = url.pathname.slice(1);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !databaseName.endsWith('_test')) {
    throw new Error(`${name} must use a localhost database whose name ends with _test.`);
  }

  return value;
}
