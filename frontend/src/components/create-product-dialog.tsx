import { useState, type FormEvent } from 'react';
import { LoaderCircle, RadioTower, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Category, CreateProductInput, Product } from '@/types/api';

interface CreateProductDialogProps {
  categories: Category[];
  sellerId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: CreateProductInput) => Promise<Product>;
}

function createSkuCode() {
  return `DEMO-${Date.now().toString(36).toUpperCase()}`;
}

export function CreateProductDialog({
  categories,
  sellerId,
  open,
  onOpenChange,
  onCreate,
}: CreateProductDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [skuCode, setSkuCode] = useState(createSkuCode);
  const [price, setPrice] = useState('129');
  const [quantity, setQuantity] = useState('25');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const effectiveCategoryId =
    categoryId || (categories[0]?.id ? String(categories[0].id) : '');

  function resetForm() {
    setName('');
    setDescription('');
    setImageUrl('');
    setCategoryId(categories[0]?.id ? String(categories[0].id) : '');
    setSkuCode(createSkuCode());
    setPrice('129');
    setQuantity('25');
    setError('');
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        categoryId: Number(effectiveCategoryId),
        sellerId,
        status: 'ACTIVE',
        skus: [
          {
            skuCode: skuCode.trim().toUpperCase(),
            price: Number(price),
            quantity: Number(quantity),
            status: 'AVAILABLE',
          },
        ],
      });
      handleOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Product could not be created.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={isSubmitting ? undefined : handleOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto p-0">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="border-b px-6 py-5 pr-12">
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="secondary" className="gap-1.5 text-[10px] uppercase tracking-wider">
                <RadioTower className="size-3 text-primary" /> ProductCreated
              </Badge>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Kafka event
              </span>
            </div>
            <DialogTitle>Publish a demo product</DialogTitle>
            <DialogDescription>
              The product service will persist this product and publish initial SKU stock
              to inventory-service.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 px-6 py-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="product-name">Product name</Label>
                <Input
                  id="product-name"
                  autoFocus
                  required
                  maxLength={255}
                  placeholder="e.g. Noise-cancelling headphones"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="product-description">
                  Description <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="product-description"
                  placeholder="A concise description for the catalog card"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-category">Category</Label>
                <Select
                  value={effectiveCategoryId}
                  onValueChange={setCategoryId}
                  required
                >
                  <SelectTrigger id="product-category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={String(category.id)}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-image">
                  Image URL <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="product-image"
                  type="url"
                  placeholder="https://…"
                  value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)}
                />
              </div>
            </div>

            <div className="rounded-xl border bg-[#fbfaf8] p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Initial SKU & inventory</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    One variant is enough to demonstrate event-driven stock creation.
                  </p>
                </div>
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-3 md:col-span-1">
                  <Label htmlFor="sku-code">SKU code</Label>
                  <Input
                    id="sku-code"
                    required
                    value={skuCode}
                    onChange={(event) => setSkuCode(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sku-price">Price (USD)</Label>
                  <Input
                    id="sku-price"
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sku-quantity">Initial stock</Label>
                  <Input
                    id="sku-quantity"
                    type="number"
                    required
                    min="0"
                    step="1"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                </div>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
              >
                {error}
              </div>
            )}
          </div>

          <DialogFooter className="border-t bg-[#fbfaf8] px-6 py-4">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || categories.length === 0}>
              {isSubmitting && <LoaderCircle className="animate-spin" />}
              {isSubmitting ? 'Publishing…' : 'Create & publish'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
