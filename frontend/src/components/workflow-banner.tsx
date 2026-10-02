import { ArrowRight, Box, CheckCircle2, RadioTower, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const steps = [
  { label: 'Catalog', detail: 'HTTP', icon: Box },
  { label: 'Product event', detail: 'Kafka', icon: RadioTower },
  { label: 'Reserve stock', detail: 'gRPC', icon: ShieldCheck },
  { label: 'Create order', detail: 'gRPC', icon: CheckCircle2 },
];

export function WorkflowBanner({ onCreateProduct }: { onCreateProduct: () => void }) {
  return (
    <section className="relative overflow-hidden rounded-[1.5rem] border border-stone-800 bg-[#1e1d1b] px-5 py-7 text-white shadow-soft sm:px-8 sm:py-9 lg:px-10">
      <div className="absolute -right-24 -top-24 size-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
        <div>
          <Badge className="mb-5 border-white/10 bg-white/10 text-stone-200 hover:bg-white/10">
            <span className="mr-1.5 size-1.5 rounded-full bg-emerald-400" />
            Live microservices demo
          </Badge>
          <h1 className="max-w-xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            From catalog to confirmed order, in one flow.
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-stone-400 sm:text-base">
            A focused interface for demonstrating gateway auth, product events,
            inventory reservation, and checkout orchestration.
          </p>
          <button
            type="button"
            onClick={onCreateProduct}
            className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[#ff9a7f] outline-none transition-colors hover:text-[#ffb29d] focus-visible:ring-2 focus-visible:ring-[#ff9a7f] focus-visible:ring-offset-4 focus-visible:ring-offset-[#1e1d1b]"
          >
            Publish a new product
            <ArrowRight className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div
                key={step.label}
                className="rounded-xl border border-white/[0.08] bg-white/[0.055] p-3 backdrop-blur-sm sm:p-4"
              >
                <div className="mb-5 flex items-center justify-between text-stone-500">
                  <Icon className="size-4 text-stone-300" />
                  <span className="font-mono text-[10px]">0{index + 1}</span>
                </div>
                <p className="text-xs font-medium text-stone-100 sm:text-sm">{step.label}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-stone-500">
                  {step.detail}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
