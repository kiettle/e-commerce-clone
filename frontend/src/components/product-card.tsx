import { useMemo, useState } from 'react';
import { Ban, Check, LoaderCircle, PackageX, Plus, RadioTower } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProductVisual } from '@/components/product-visual';
import { formatCurrency } from '@/lib/utils';
import type { Category, Product } from '@/types/api';

interface ProductCardProps {
  product: Product;
  category?: Category;
  isAdding: boolean;
  isNewlyPublished: boolean;
  onAdd: (skuId: number) => Promise<void>;
}

export function ProductCard({
  product,
  category,
  isAdding,
  isNewlyPublished,
  onAdd,
}: ProductCardProps) {
  const availableSkus = useMemo(
    () => product.skus.filter((sku) => sku.status === 'AVAILABLE'),
    [product.skus],
  );
  const [selectedSkuId, setSelectedSkuId] = useState(
    availableSkus[0]?.id ? String(availableSkus[0].id) : '',
  );

  const effectiveSkuId = availableSkus.some((sku) => String(sku.id) === selectedSkuId)
    ? selectedSkuId
    : availableSkus[0]?.id
      ? String(availableSkus[0].id)
      : '';
  const selectedSku = availableSkus.find((sku) => String(sku.id) === effectiveSkuId);
  const status = productStatusConfig[product.status];
  const StatusIcon = status.icon;
  const canAddToCart = product.status === 'ACTIVE' && Boolean(selectedSku);

  return (
    <Card
      data-testid={`product-card-${product.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border-stone-200/80 bg-white shadow-none transition-all duration-300 hover:-translate-y-1 hover:border-stone-300 hover:shadow-soft"
    >
      <div className="relative p-2 pb-0">
        <ProductVisual
          imageUrl={product.imageUrl}
          productName={product.name}
          categorySlug={category?.slug}
          className="aspect-[4/2.7] rounded-xl"
        />
        <Badge
          variant="secondary"
          className="absolute left-5 top-5 border border-white/50 bg-white/80 text-[10px] text-stone-700 shadow-sm backdrop-blur"
        >
          {category?.name ?? 'Uncategorized'}
        </Badge>
        {isNewlyPublished && (
          <Badge className="absolute right-5 top-5 gap-1 bg-[#2e5f4e] text-[10px] text-white">
            <RadioTower className="size-3" /> Event published
          </Badge>
        )}
      </div>

      <CardContent className="flex flex-1 flex-col p-5">
        <div className="mb-4 min-h-[4.4rem]">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold tracking-[-0.02em] text-stone-900">
              {product.name}
            </h3>
            <span
              className={`mt-1 flex shrink-0 items-center gap-1 text-[10px] font-medium uppercase tracking-wider ${status.className}`}
            >
              <StatusIcon className="size-3" /> {status.label}
            </span>
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-muted-foreground">
            {product.description || 'No product description provided.'}
          </p>
        </div>

        <div className="mt-auto space-y-3">
          <Select value={effectiveSkuId} onValueChange={setSelectedSkuId}>
            <SelectTrigger aria-label={`Choose a variant for ${product.name}`}>
              <SelectValue placeholder="No available variants" />
            </SelectTrigger>
            <SelectContent>
              {availableSkus.map((sku) => (
                <SelectItem key={sku.id} value={String(sku.id)}>
                  {sku.skuCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Price
              </p>
              <p className="text-lg font-semibold tracking-tight text-stone-900">
                {selectedSku ? formatCurrency(selectedSku.price) : 'Unavailable'}
              </p>
            </div>
            <Button
              size="sm"
              className="rounded-lg px-4"
              disabled={!canAddToCart || isAdding}
              onClick={() => selectedSku && onAdd(selectedSku.id)}
            >
              {isAdding ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Plus />
              )}
              Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const productStatusConfig = {
  ACTIVE: {
    label: 'Active',
    className: 'text-emerald-700',
    icon: Check,
  },
  INACTIVE: {
    label: 'Inactive',
    className: 'text-stone-500',
    icon: Ban,
  },
  OUT_OF_STOCK: {
    label: 'Out of stock',
    className: 'text-amber-700',
    icon: PackageX,
  },
  DELETED: {
    label: 'Deleted',
    className: 'text-red-700',
    icon: Ban,
  },
} as const;
