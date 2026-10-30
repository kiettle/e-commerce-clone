import { CartEntity } from '../../domain/entities/cart.entity';
import { CheckoutAttemptEntity } from '../../domain/entities/checkout-attempt.entity';
import { CheckoutStatus } from '../../domain/enums/checkout-status.enum';
import type { CartResponse, CheckoutStatusResponse } from '../../../../../../libs/proto/cart.types';

export function toCartResponse(cart: CartEntity): CartResponse {
  return {
    id: String(cart.id),
    user_id: String(cart.userId),
    status: cart.status,
    total_amount: cart.totalAmount,
    items: cart.items.map((item) => ({
      id: String(item.id),
      cart_id: String(item.cartId),
      product_id: String(item.productId),
      product_name: item.productName,
      image_url: item.imageUrl ?? undefined,
      product_sku_id: String(item.productSkuId),
      sku_code: item.skuCode,
      price: item.price,
      regular_price: item.regularPrice,
      price_source: item.priceSource,
      flash_sale_id: item.flashSaleId == null ? undefined : String(item.flashSaleId),
      flash_sale_item_id: item.flashSaleItemId == null ? undefined : String(item.flashSaleItemId),
      sale_ends_at: item.saleEndsAt?.toISOString(),
      max_quantity_per_user: item.maxPerUserQuantity ?? undefined,
      quantity: item.quantity,
      subtotal: item.subtotal,
    })),
  };
}

export function toCheckoutStatusResponse(attempt: CheckoutAttemptEntity): CheckoutStatusResponse {
  return {
    checkout_id: attempt.id,
    cart_id: String(attempt.cartId),
    status: attempt.status,
    order_id: attempt.orderId == null ? undefined : String(attempt.orderId),
    last_error:
      attempt.lastError == null
        ? undefined
        : attempt.status === CheckoutStatus.Failed
          ? 'Checkout failed.'
          : 'Checkout is awaiting recovery.',
    created_at: attempt.createdAt.toISOString(),
    updated_at: attempt.updatedAt.toISOString(),
  };
}
