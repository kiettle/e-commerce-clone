import { useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  LoaderCircle,
  PackageCheck,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/utils';
import type { Cart, CheckoutResult } from '@/types/api';

interface CheckoutDialogProps {
  cart: Cart | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<CheckoutResult>;
}

export function CheckoutDialog({
  cart,
  open,
  onOpenChange,
  onConfirm,
}: CheckoutDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [error, setError] = useState('');

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setResult(null);
      setError('');
    }
    onOpenChange(nextOpen);
  }

  async function handleConfirm() {
    setIsSubmitting(true);
    setError('');
    try {
      setResult(await onConfirm());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Checkout could not be completed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={isSubmitting ? undefined : handleOpenChange}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        {result ? (
          <>
            <div className="relative overflow-hidden bg-[#1f3f35] px-6 pb-7 pt-8 text-white">
              <span className="absolute -right-16 -top-20 size-48 rounded-full border border-white/10" />
              <span className="grid size-12 place-items-center rounded-2xl bg-white/10">
                <CheckCircle2 className="size-6 text-emerald-300" />
              </span>
              <p className="mt-6 text-xs font-medium uppercase tracking-[0.18em] text-emerald-200">
                Checkout complete
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                Order #{result.orderId} is confirmed.
              </h2>
              <p className="mt-2 text-sm leading-6 text-emerald-100/70">
                Inventory was reserved, the order snapshot was persisted, and the cart
                is now checked out.
              </p>
            </div>
            <div className="space-y-4 px-6 py-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Items processed</span>
                <span className="font-medium">{result.cart.items.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Order total</span>
                <span className="font-semibold tabular-nums">
                  {formatCurrency(result.cart.totalAmount)}
                </span>
              </div>
              <Separator />
              <Button className="w-full" onClick={() => handleOpenChange(false)}>
                Continue demo
                <ArrowRight />
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="px-6 pt-6">
              <DialogTitle>Review checkout</DialogTitle>
              <DialogDescription>
                This runs the real cart orchestration across inventory and order
                services.
              </DialogDescription>
            </DialogHeader>

            <div className="px-6">
              <div className="rounded-xl border bg-secondary/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {cart?.items.length ?? 0} product{cart?.items.length === 1 ? '' : 's'}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(cart?.totalAmount ?? 0)}
                  </span>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                    <ShieldCheck className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">Reserve every stock item</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      inventory-service validates the batch before mutation.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-orange-50 text-orange-700">
                    <PackageCheck className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">Persist the order snapshot</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      order-service calculates the trusted total server-side.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-700">
                    <Check className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">Mark this cart checked out</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Failed order creation triggers stock compensation.
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mt-5 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
                >
                  {error}
                </div>
              )}
            </div>

            <DialogFooter className="border-t bg-[#fbfaf8] px-6 py-4">
              <Button
                variant="outline"
                disabled={isSubmitting}
                onClick={() => handleOpenChange(false)}
              >
                Back to cart
              </Button>
              <Button disabled={isSubmitting || !cart?.items.length} onClick={handleConfirm}>
                {isSubmitting && <LoaderCircle className="animate-spin" />}
                {isSubmitting ? 'Orchestrating…' : 'Confirm checkout'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
