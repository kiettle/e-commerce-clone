import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Check,
  CircleAlert,
  Database,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Network,
  RadioTower,
} from 'lucide-react';
import { BrandMark } from '@/components/brand-mark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/auth-context';
import { api } from '@/lib/api';

const DEMO_EMAIL = 'testuser@test.com';
const DEMO_PASSWORD = 'password123';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [gatewayOnline, setGatewayOnline] = useState<boolean | null>(null);
  const healthPromise = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    healthPromise.current ??= api
      .health()
      .then(() => true)
      .catch(() => false);

    let isActive = true;
    void healthPromise.current.then((isOnline) => {
      if (isActive) setGatewayOnline(isOnline);
    });

    return () => {
      isActive = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(email.trim(), password);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The gateway could not complete the sign-in request.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f2ed] p-3 sm:p-5 lg:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1500px] overflow-hidden rounded-[1.75rem] border border-stone-200 bg-background shadow-soft sm:min-h-[calc(100vh-2.5rem)] lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative hidden overflow-hidden bg-[#1d1d1b] px-12 py-10 text-white lg:flex lg:flex-col xl:px-16 xl:py-12">
          <div className="absolute -left-28 bottom-[-10rem] size-[28rem] rounded-full bg-[#f16f50]/15 blur-3xl" />
          <div className="absolute -right-40 top-[-9rem] size-[28rem] rounded-full border border-white/[0.06]" />
          <div className="relative [&_span]:text-white">
            <BrandMark />
          </div>

          <div className="relative my-auto max-w-2xl pb-12 pt-16">
            <Badge className="mb-7 border-white/10 bg-white/[0.07] text-stone-300 hover:bg-white/[0.07]">
              Backend portfolio demo
            </Badge>
            <h1 className="text-5xl font-semibold leading-[1.04] tracking-[-0.055em] xl:text-6xl">
              One storefront.
              <br />
              Six services in motion.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-stone-400 xl:text-lg">
              Follow a real request from JWT validation through product events, stock
              reservation, order creation, and checkout completion.
            </p>

            <div className="mt-12 grid grid-cols-3 gap-3">
              {[
                { label: 'Gateway', detail: 'HTTP + JWT', icon: Network },
                { label: 'Messaging', detail: 'Kafka event', icon: RadioTower },
                { label: 'Persistence', detail: '5 databases', icon: Database },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-white/[0.08] bg-white/[0.045] p-4 backdrop-blur-sm"
                  >
                    <Icon className="mb-8 size-5 text-[#ff9a7f]" strokeWidth={1.7} />
                    <p className="text-sm font-medium text-stone-100">{item.label}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-stone-500">
                      {item.detail}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative flex items-center gap-2 text-xs text-stone-500">
            <LockKeyhole className="size-3.5" />
            Demo credentials are seeded locally—no mock API layer.
          </div>
        </section>

        <section className="flex min-h-[calc(100vh-1.5rem)] flex-col bg-[#fbfaf8] sm:min-h-[calc(100vh-2.5rem)]">
          <div className="flex items-center justify-between px-6 py-5 sm:px-10 lg:justify-end">
            <div className="lg:hidden">
              <BrandMark />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className={`size-2 rounded-full ${
                  gatewayOnline === null
                    ? 'animate-pulse bg-stone-300'
                    : gatewayOnline
                      ? 'bg-emerald-500'
                      : 'bg-red-500'
                }`}
              />
              {gatewayOnline === null
                ? 'Checking gateway'
                : gatewayOnline
                  ? 'Gateway online'
                  : 'Gateway offline'}
            </div>
          </div>

          <div className="my-auto px-6 py-10 sm:px-10 lg:px-14 xl:px-24">
            <div className="mx-auto max-w-md">
              <div className="mb-8">
                <span className="mb-5 grid size-11 place-items-center rounded-2xl border bg-white shadow-sm">
                  <KeyRound className="size-5 text-primary" />
                </span>
                <h2 className="text-3xl font-semibold tracking-[-0.045em] text-stone-900">
                  Start the demo
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Sign in through the gateway with the seeded portfolio account.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <span className="text-xs text-muted-foreground">8+ characters</span>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="flex gap-2.5 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
                  >
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button type="submit" size="lg" className="w-full rounded-xl" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Check />
                  )}
                  {isSubmitting ? 'Validating through auth-service…' : 'Enter demo workspace'}
                  {!isSubmitting && <ArrowRight className="ml-auto" />}
                </Button>
              </form>

              <div className="mt-6 rounded-xl border border-dashed bg-white/60 px-4 py-3 text-xs leading-5 text-muted-foreground">
                <span className="font-medium text-foreground">Demo account:</span>{' '}
                {DEMO_EMAIL} · {DEMO_PASSWORD}
              </div>
            </div>
          </div>

          <p className="px-6 py-5 text-center text-[11px] text-muted-foreground sm:px-10">
            React demo client · NestJS gateway · Auth validated over gRPC
          </p>
        </section>
      </div>
    </main>
  );
}
