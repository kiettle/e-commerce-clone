import { useState } from 'react';
import { Headphones, Laptop, Package, Smartphone, Tablet } from 'lucide-react';
import { cn } from '@/lib/utils';

const categoryVisuals = {
  smartphones: { icon: Smartphone, className: 'from-[#efe4dc] to-[#d8beb1] text-[#6d4437]' },
  laptops: { icon: Laptop, className: 'from-[#e2e5df] to-[#bdc8bd] text-[#3e5545]' },
  tablets: { icon: Tablet, className: 'from-[#e8e1d7] to-[#cfc0aa] text-[#655341]' },
  accessories: { icon: Headphones, className: 'from-[#e1e2e8] to-[#c1c5d1] text-[#444b61]' },
};

interface ProductVisualProps {
  imageUrl?: string | null;
  categorySlug?: string;
  productName: string;
  className?: string;
  iconClassName?: string;
}

export function ProductVisual({
  imageUrl,
  categorySlug,
  productName,
  className,
  iconClassName,
}: ProductVisualProps) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const canShowImage = Boolean(imageUrl && failedImageUrl !== imageUrl);

  if (imageUrl && canShowImage) {
    return (
      <div className={cn('overflow-hidden bg-muted', className)}>
        <img
          src={imageUrl}
          alt={productName}
          loading="lazy"
          decoding="async"
          onError={() => setFailedImageUrl(imageUrl)}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </div>
    );
  }

  const visual = categoryVisuals[categorySlug as keyof typeof categoryVisuals];
  const Icon = visual?.icon ?? Package;

  return (
    <div
      role="img"
      aria-label={`${productName} product placeholder`}
      className={cn(
        'relative grid place-items-center overflow-hidden bg-gradient-to-br',
        visual?.className ?? 'from-[#e9e5df] to-[#cbc4ba] text-[#5f574e]',
        className,
      )}
    >
      <span className="absolute -right-10 -top-12 size-32 rounded-full border border-white/35" />
      <span className="absolute -bottom-16 -left-10 size-36 rounded-full bg-white/20" />
      <Icon
        className={cn(
          'relative size-14 drop-shadow-[0_8px_18px_rgba(52,45,40,0.12)] transition-transform duration-500 group-hover:-translate-y-1 group-hover:scale-105',
          iconClassName,
        )}
        strokeWidth={1.25}
      />
    </div>
  );
}
