import { LoaderCircle, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { ProductVisual } from '@/components/product-visual';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatCurrency } from '@/lib/utils';
import type { Cart } from '@/types/api';

interface CartSheetProps {
  cart: Cart | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updatingItemId: number | null;
  onUpdateQuantity: (itemId: number, quantity: number) => Promise<void>;
  onRemoveItem: (itemId: number) => Promise<void>;
  onCheckout: () => void;
}

export function CartSheet({
  cart,
  open,
  onOpenChange,
  updatingItemId,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
}: CartSheetProps) {
  const itemCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col p-0 sm:max-w-[440px]">
        <SheetHeader className="border-b px-5 py-5 pr-12 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-secondary">
              <ShoppingBag className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <SheetTitle>Your cart</SheetTitle>
                <Badge variant="secondary" className="tabular-nums">
                  {itemCount}
                </Badge>
              </div>
              <SheetDescription>Product snapshots from cart-service</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {!cart?.items.length ? (
            <div className="grid h-full min-h-80 place-items-center text-center">
              <div>
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary text-muted-foreground">
                  <ShoppingBag className="size-6" />
                </span>
                <h3 className="mt-4 font-semibold">Your cart is ready</h3>
                <p className="mx-auto mt-1.5 max-w-60 text-sm leading-5 text-muted-foreground">
                  Choose a product variant to begin the checkout demo.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-5"
                  onClick={() => onOpenChange(false)}
                >
                  Browse catalog
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {cart.items.map((item) => {
                const isUpdating = updatingItemId === item.id;
                return (
                  <article key={item.id} className="group grid grid-cols-[72px_1fr] gap-4">
                    <ProductVisual
                      imageUrl={item.imageUrl}
                      productName={item.productName}
                      className="size-[72px] rounded-xl"
                      iconClassName="size-7"
                    />
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-semibold">{item.productName}</h4>
                          <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                            {item.skuCode}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Remove ${item.productName}`}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                          disabled={isUpdating}
                          onClick={() => onRemoveItem(item.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex h-8 items-center rounded-lg border bg-background">
                          <button
                            type="button"
                            aria-label={`Decrease ${item.productName} quantity`}
                            className="grid size-8 place-items-center rounded-l-lg text-muted-foreground hover:bg-secondary disabled:opacity-40"
                            disabled={isUpdating}
                            onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                          >
                            <Minus className="size-3" />
                          </button>
                          <span className="grid w-8 place-items-center text-xs font-medium tabular-nums">
                            {isUpdating ? (
                              <LoaderCircle className="size-3 animate-spin text-primary" />
                            ) : (
                              item.quantity
                            )}
                          </span>
                          <button
                            type="button"
                            aria-label={`Increase ${item.productName} quantity`}
                            className="grid size-8 place-items-center rounded-r-lg text-muted-foreground hover:bg-secondary disabled:opacity-40"
                            disabled={isUpdating}
                            onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                          >
                            <Plus className="size-3" />
                          </button>
                        </div>
                        <p className="text-sm font-semibold tabular-nums">
                          {formatCurrency(item.subtotal)}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t bg-[#fbfaf8] px-5 py-5 sm:px-6">
          <div className="mb-4 space-y-2 text-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCurrency(cart?.totalAmount ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Delivery</span>
              <span>Included in demo</span>
            </div>
          </div>
          <Separator />
          <div className="my-4 flex items-end justify-between">
            <span className="font-medium">Total</span>
            <span className="text-2xl font-semibold tracking-tight tabular-nums">
              {formatCurrency(cart?.totalAmount ?? 0)}
            </span>
          </div>
          <Button
            size="lg"
            className="w-full rounded-xl"
            disabled={!cart?.items.length || updatingItemId !== null}
            onClick={onCheckout}
          >
            Review checkout
          </Button>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Reserves inventory before creating the order
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
