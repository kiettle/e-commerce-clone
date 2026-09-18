import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { PaymentStatus } from '../../../domain/enums/payment-status.enum';
import { CheckoutIdConflictError } from '../../../domain/errors/checkout-id-conflict.error';
import { OrderCreateData } from '../../../domain/repositories/order.repository.port';
import { PrismaOrderRepository } from './order.prisma.repository';
import { PrismaService } from './prisma.service';

describe('PrismaOrderRepository', () => {
  const checkoutId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const requestHash = 'a'.repeat(64);
  const orderData: OrderCreateData = {
    userId: 7n,
    checkoutId,
    cartId: 55n,
    requestHash,
    totalAmount: 19.99,
    status: OrderStatus.Created,
    paymentStatus: PaymentStatus.Pending,
    items: [
      {
        productName: 'Keyboard',
        productSkuId: 101n,
        skuCode: 'KEYBOARD-BLACK',
        imageUrl: null,
        price: 19.99,
        quantity: 1,
      },
    ],
  };
  const storedOrder = {
    id: 9001n,
    userId: 7n,
    checkoutId,
    cartId: 55n,
    requestHash,
    totalAmount: 19.99,
    status: OrderStatus.Created,
    paymentStatus: PaymentStatus.Pending,
    shippingAddress: null,
    createdAt: new Date('2026-09-17T00:00:00.000Z'),
    updatedAt: new Date('2026-09-17T00:00:00.000Z'),
    items: [],
  };

  let create: ReturnType<typeof vi.fn>;
  let findUnique: ReturnType<typeof vi.fn>;
  let repository: PrismaOrderRepository;

  beforeEach(() => {
    create = vi.fn();
    findUnique = vi.fn();
    repository = new PrismaOrderRepository({
      order: { create, findUnique },
    } as unknown as PrismaService);
  });

  it('creates the order and its items in one nested write', async () => {
    create.mockResolvedValue(storedOrder);

    await expect(repository.create(orderData)).resolves.toMatchObject({
      id: 9001n,
      checkoutId,
      requestHash,
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 7n,
        checkoutId,
        cartId: 55n,
        requestHash,
        totalAmount: 19.99,
        status: OrderStatus.Created,
        paymentStatus: PaymentStatus.Pending,
        shippingAddress: undefined,
        items: {
          create: orderData.items,
        },
      },
      include: { items: true },
    });
  });

  it('returns the winning order after a matching unique-constraint race', async () => {
    create.mockRejectedValue({ code: 'P2002' });
    findUnique.mockResolvedValue(storedOrder);

    const result = await repository.create(orderData);

    expect(result.id).toBe(9001n);
    expect(result.requestHash).toBe(requestHash);
    expect(findUnique).toHaveBeenCalledWith({
      where: { checkoutId },
      include: { items: true },
    });
  });

  it('rejects a winning order with a different request hash', async () => {
    create.mockRejectedValue({ code: 'P2002' });
    findUnique.mockResolvedValue({
      ...storedOrder,
      requestHash: 'b'.repeat(64),
    });

    await expect(repository.create(orderData)).rejects.toBeInstanceOf(
      CheckoutIdConflictError,
    );
  });
});
