import { Injectable } from '@nestjs/common';
import {
  Order as PrismaOrder,
  OrderItem as PrismaOrderItem,
} from '../../../../../../../prisma/generated/order';
import { OrderItemEntity } from '../../../domain/entities/order-item.entity';
import { OrderEntity } from '../../../domain/entities/order.entity';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { PaymentStatus } from '../../../domain/enums/payment-status.enum';
import {
  OrderCreateData,
  OrderRepositoryPort,
} from '../../../domain/repositories/order.repository.port';
import { PrismaService } from './prisma.service';

type PrismaOrderWithItems = PrismaOrder & {
  items: PrismaOrderItem[];
};

@Injectable()
export class PrismaOrderRepository implements OrderRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: OrderCreateData): Promise<OrderEntity> {
    const order = await this.prisma.order.create({
      data: {
        userId: data.userId,
        checkoutId: data.checkoutId,
        cartId: data.cartId,
        requestHash: data.requestHash,
        totalAmount: data.totalAmount,
        status: data.status,
        paymentStatus: data.paymentStatus,
        shippingAddress: data.shippingAddress,
        items: {
          create: data.items.map((item) => ({
            productName: item.productName,
            productSkuId: item.productSkuId,
            skuCode: item.skuCode,
            imageUrl: item.imageUrl,
            price: item.price,
            quantity: item.quantity,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    return this.toDomain(order);
  }

  async findByCheckoutId(checkoutId: string): Promise<OrderEntity | null> {
    const order = await this.prisma.order.findUnique({
      where: { checkoutId },
      include: { items: true },
    });

    return order ? this.toDomain(order) : null;
  }

  private toDomain(order: PrismaOrderWithItems): OrderEntity {
    return new OrderEntity({
      id: order.id,
      userId: order.userId,
      checkoutId: order.checkoutId,
      cartId: order.cartId,
      requestHash: order.requestHash,
      totalAmount: Number(order.totalAmount),
      status: order.status as OrderStatus,
      paymentStatus: order.paymentStatus as PaymentStatus,
      shippingAddress: order.shippingAddress,
      items: order.items.map((item) => this.toItemDomain(item)),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    });
  }

  private toItemDomain(item: PrismaOrderItem): OrderItemEntity {
    return new OrderItemEntity({
      id: item.id,
      orderId: item.orderId,
      productName: item.productName,
      productSkuId: item.productSkuId,
      skuCode: item.skuCode,
      imageUrl: item.imageUrl,
      price: Number(item.price),
      quantity: item.quantity,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });
  }
}
