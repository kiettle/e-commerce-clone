import { Injectable } from '@nestjs/common';
import {
  Cart as PrismaCart,
  CartItem as PrismaCartItem,
  Prisma,
} from '../../../../../../../prisma/generated/cart';
import { CartItemEntity } from '../../../domain/entities/cart-item.entity';
import { CartEntity } from '../../../domain/entities/cart.entity';
import { CartStatus } from '../../../domain/enums/cart-status.enum';
import { CartItemPriceSource } from '../../../domain/enums/cart-item-price-source.enum';
import { CartItemNotFoundError } from '../../../domain/errors/cart-item-not-found.error';
import { CartItemPricingChangedError } from '../../../domain/errors/cart-item-pricing-changed.error';
import { CartNotFoundError } from '../../../domain/errors/cart-not-found.error';
import { InvalidCartOperationError } from '../../../domain/errors/invalid-cart-operation.error';
import { FlashSaleQuantityExceededError } from '../../../domain/errors/flash-sale-quantity-exceeded.error';
import {
  CartItemSnapshotData,
  CartRepositoryPort,
} from '../../../domain/repositories/cart.repository.port';
import { PrismaService } from './prisma.service';

type TransactionClient = Prisma.TransactionClient;
type PrismaCartWithItems = PrismaCart & {
  items: PrismaCartItem[];
};
type PrismaCartItemWithCart = PrismaCartItem & {
  cart: PrismaCart;
};

@Injectable()
export class PrismaCartRepository implements CartRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateActiveCart(userId: bigint): Promise<CartEntity> {
    const cart = await this.prisma.$transaction(async (transaction) => {
      const activeCart = await this.findActiveCartByUserId(transaction, userId);

      if (activeCart) {
        return activeCart;
      }

      return transaction.cart.create({
        data: {
          userId,
          status: CartStatus.Active,
        },
        include: cartItemsInclude(),
      });
    });

    return PrismaCartRepository.toDomain(cart);
  }

  async findById(cartId: bigint): Promise<CartEntity | null> {
    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
      include: cartItemsInclude(),
    });

    return cart ? PrismaCartRepository.toDomain(cart) : null;
  }

  async addOrIncrementItem(
    cartId: bigint,
    item: CartItemSnapshotData,
    quantity: number,
  ): Promise<CartEntity> {
    const cart = await this.prisma.$transaction(async (transaction) => {
      await lockCart(transaction, cartId);
      const activeCart = await this.findActiveCartById(transaction, cartId);
      assertActiveCart(activeCart);
      await assertCartNotFrozen(transaction, cartId);

      const existingItem = await transaction.cartItem.findUnique({
        where: {
          cartId_productSkuId: {
            cartId,
            productSkuId: item.productSkuId,
          },
        },
      });

      if (existingItem) {
        if (!samePricingContext(existingItem, item)) {
          throw new CartItemPricingChangedError();
        }
        if (
          existingItem.priceSource === CartItemPriceSource.FlashSale &&
          existingItem.quantity + quantity > (existingItem.maxPerUserQuantity ?? 1)
        ) {
          throw new FlashSaleQuantityExceededError();
        }
        await transaction.cartItem.update({
          where: { id: existingItem.id },
          data: {
            quantity: {
              increment: quantity,
            },
          },
        });
      } else {
        await transaction.cartItem.create({
          data: {
            cartId,
            productId: item.productId,
            productName: item.productName,
            imageUrl: item.imageUrl,
            productSkuId: item.productSkuId,
            flashSaleId: item.flashSaleId,
            flashSaleItemId: item.flashSaleItemId,
            skuCode: item.skuCode,
            price: item.price,
            regularPrice: item.regularPrice,
            priceSource: item.priceSource,
            saleEndsAt: item.saleEndsAt,
            maxPerUserQuantity: item.maxPerUserQuantity,
            quantity,
          },
        });
      }

      return this.findCartByIdOrThrow(transaction, cartId);
    });

    return PrismaCartRepository.toDomain(cart);
  }

  async updateItemQuantity(
    userId: bigint,
    cartItemId: bigint,
    quantity: number,
  ): Promise<CartEntity> {
    const cart = await this.prisma.$transaction(async (transaction) => {
      const cartItem = await this.findCartItemForUser(transaction, userId, cartItemId);
      await lockCart(transaction, cartItem.cartId);
      const activeCart = await this.findActiveCartById(transaction, cartItem.cartId);
      assertActiveCart(activeCart);
      await assertCartNotFrozen(transaction, cartItem.cartId);

      if (
        cartItem.priceSource === CartItemPriceSource.FlashSale &&
        quantity > (cartItem.maxPerUserQuantity ?? 1)
      ) {
        throw new FlashSaleQuantityExceededError();
      }

      if (quantity === 0) {
        await transaction.cartItem.delete({
          where: { id: cartItemId },
        });
      } else {
        await transaction.cartItem.update({
          where: { id: cartItemId },
          data: { quantity },
        });
      }

      return this.findCartByIdOrThrow(transaction, cartItem.cartId);
    });

    return PrismaCartRepository.toDomain(cart);
  }

  async deleteItem(userId: bigint, cartItemId: bigint): Promise<CartEntity> {
    const cart = await this.prisma.$transaction(async (transaction) => {
      const cartItem = await this.findCartItemForUser(transaction, userId, cartItemId);
      await lockCart(transaction, cartItem.cartId);
      const activeCart = await this.findActiveCartById(transaction, cartItem.cartId);
      assertActiveCart(activeCart);
      await assertCartNotFrozen(transaction, cartItem.cartId);

      await transaction.cartItem.delete({
        where: { id: cartItemId },
      });

      return this.findCartByIdOrThrow(transaction, cartItem.cartId);
    });

    return PrismaCartRepository.toDomain(cart);
  }

  async markCheckedOut(cartId: bigint): Promise<CartEntity> {
    const cart = await this.prisma.$transaction(async (transaction) => {
      const activeCart = await this.findActiveCartById(transaction, cartId);
      assertActiveCart(activeCart);

      return transaction.cart.update({
        where: { id: cartId },
        data: { status: CartStatus.CheckedOut },
        include: cartItemsInclude(),
      });
    });

    return PrismaCartRepository.toDomain(cart);
  }

  private findActiveCartByUserId(
    transaction: TransactionClient,
    userId: bigint,
  ): Promise<PrismaCartWithItems | null> {
    return transaction.cart.findFirst({
      where: {
        userId,
        status: CartStatus.Active,
      },
      include: cartItemsInclude(),
      orderBy: { id: 'asc' },
    });
  }

  private async findActiveCartById(
    transaction: TransactionClient,
    cartId: bigint,
  ): Promise<PrismaCart> {
    const cart = await transaction.cart.findUnique({
      where: { id: cartId },
    });

    if (!cart) {
      throw new CartNotFoundError(cartId);
    }

    return cart;
  }

  private async findCartByIdOrThrow(
    transaction: TransactionClient,
    cartId: bigint,
  ): Promise<PrismaCartWithItems> {
    const cart = await transaction.cart.findUnique({
      where: { id: cartId },
      include: cartItemsInclude(),
    });

    if (!cart) {
      throw new CartNotFoundError(cartId);
    }

    return cart;
  }

  private async findCartItemForUser(
    transaction: TransactionClient,
    userId: bigint,
    cartItemId: bigint,
  ): Promise<PrismaCartItemWithCart> {
    const cartItem = await transaction.cartItem.findUnique({
      where: { id: cartItemId },
      include: { cart: true },
    });

    if (!cartItem || cartItem.cart.userId !== userId) {
      throw new CartItemNotFoundError(cartItemId);
    }

    return cartItem;
  }

  static toDomain(cart: PrismaCartWithItems): CartEntity {
    return new CartEntity({
      id: cart.id,
      userId: cart.userId,
      status: cart.status as CartStatus,
      items: cart.items.map((item) => PrismaCartRepository.toItemDomain(item)),
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
    });
  }

  private static toItemDomain(item: PrismaCartItem): CartItemEntity {
    return new CartItemEntity({
      id: item.id,
      cartId: item.cartId,
      productId: item.productId,
      productName: item.productName,
      imageUrl: item.imageUrl,
      productSkuId: item.productSkuId,
      flashSaleId: item.flashSaleId,
      flashSaleItemId: item.flashSaleItemId,
      skuCode: item.skuCode,
      price: Number(item.price),
      regularPrice: Number(item.regularPrice),
      priceSource: item.priceSource as CartItemPriceSource,
      saleEndsAt: item.saleEndsAt,
      maxPerUserQuantity: item.maxPerUserQuantity,
      quantity: item.quantity,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });
  }
}

function samePricingContext(existing: PrismaCartItem, incoming: CartItemSnapshotData): boolean {
  return (
    existing.priceSource === incoming.priceSource &&
    Number(existing.price) === incoming.price &&
    Number(existing.regularPrice) === incoming.regularPrice &&
    existing.flashSaleId === (incoming.flashSaleId ?? null) &&
    existing.flashSaleItemId === (incoming.flashSaleItemId ?? null) &&
    existing.saleEndsAt?.getTime() === incoming.saleEndsAt?.getTime() &&
    existing.maxPerUserQuantity === (incoming.maxPerUserQuantity ?? null)
  );
}

function cartItemsInclude() {
  return {
    items: {
      orderBy: { id: 'asc' as const },
    },
  };
}

function assertActiveCart(cart: PrismaCart): void {
  if (cart.status !== CartStatus.Active) {
    throw new InvalidCartOperationError('Cart is not active.');
  }
}

async function lockCart(transaction: TransactionClient, cartId: bigint): Promise<void> {
  await transaction.$queryRaw`
    SELECT "id" FROM "carts" WHERE "id" = ${cartId} FOR UPDATE
  `;
}

async function assertCartNotFrozen(transaction: TransactionClient, cartId: bigint): Promise<void> {
  const attempt = await transaction.checkoutAttempt.findUnique({
    where: { cartId },
    select: { id: true },
  });

  if (attempt) {
    throw new InvalidCartOperationError('Cart items cannot be changed after checkout starts.');
  }
}
