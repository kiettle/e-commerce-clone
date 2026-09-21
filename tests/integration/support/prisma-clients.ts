import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient as AuthPrismaClient } from '../../../prisma/generated/auth/client';
import { PrismaClient as CartPrismaClient } from '../../../prisma/generated/cart/client';
import { PrismaClient as InventoryPrismaClient } from '../../../prisma/generated/inventory/client';
import { PrismaClient as OrderPrismaClient } from '../../../prisma/generated/order/client';
import { PrismaClient as ProductPrismaClient } from '../../../prisma/generated/product/client';
import { IntegrationDatabaseUrls, readIntegrationDatabaseUrls } from './database-urls';

export interface IntegrationPrismaClients {
  auth: AuthPrismaClient;
  product: ProductPrismaClient;
  inventory: InventoryPrismaClient;
  cart: CartPrismaClient;
  order: OrderPrismaClient;
}

export async function createIntegrationPrismaClients(
  urls: IntegrationDatabaseUrls = readIntegrationDatabaseUrls(),
): Promise<IntegrationPrismaClients> {
  const clients: IntegrationPrismaClients = {
    auth: new AuthPrismaClient({ adapter: new PrismaPg({ connectionString: urls.auth }) }),
    product: new ProductPrismaClient({
      adapter: new PrismaPg({ connectionString: urls.product }),
    }),
    inventory: new InventoryPrismaClient({
      adapter: new PrismaPg({ connectionString: urls.inventory }),
    }),
    cart: new CartPrismaClient({ adapter: new PrismaPg({ connectionString: urls.cart }) }),
    order: new OrderPrismaClient({ adapter: new PrismaPg({ connectionString: urls.order }) }),
  };

  try {
    await Promise.all(Object.values(clients).map((client) => client.$connect()));
    return clients;
  } catch (error) {
    await disconnectIntegrationPrismaClients(clients);
    throw error;
  }
}

export async function cleanIntegrationDatabases(clients: IntegrationPrismaClients): Promise<void> {
  await clients.cart.$transaction([
    clients.cart.checkoutAttempt.deleteMany(),
    clients.cart.cartItem.deleteMany(),
    clients.cart.cart.deleteMany(),
  ]);
  await clients.order.$transaction([
    clients.order.orderItem.deleteMany(),
    clients.order.order.deleteMany(),
  ]);
  await clients.inventory.$transaction([
    clients.inventory.stockTransaction.deleteMany(),
    clients.inventory.stockReservation.deleteMany(),
    clients.inventory.flashSaleStock.deleteMany(),
    clients.inventory.processedFlashSaleEvent.deleteMany(),
    clients.inventory.inventoryStock.deleteMany(),
    clients.inventory.processedProductEvent.deleteMany(),
  ]);
  await clients.product.$transaction([
    clients.product.flashSaleItem.deleteMany(),
    clients.product.flashSale.deleteMany(),
    clients.product.productOutboxEvent.deleteMany(),
    clients.product.productSku.deleteMany(),
    clients.product.product.deleteMany(),
    clients.product.category.deleteMany(),
  ]);
  await clients.auth.user.deleteMany();
}

export async function disconnectIntegrationPrismaClients(
  clients: IntegrationPrismaClients,
): Promise<void> {
  await Promise.allSettled(Object.values(clients).map((client) => client.$disconnect()));
}
