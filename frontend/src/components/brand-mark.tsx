import { Boxes } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Boxes className="size-[18px]" strokeWidth={2.2} />
      </span>
      <span className={cn('font-semibold tracking-[-0.025em]', compact && 'hidden sm:block')}>
        Marketflow
      </span>
    </div>
  );
}
