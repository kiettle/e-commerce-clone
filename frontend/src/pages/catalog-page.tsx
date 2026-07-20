import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  ArrowRight,
  Boxes,
  CircleAlert,
  LoaderCircle,
  LogOut,
  PackageOpen,
  Plus,
  Search,
  ShoppingBag,
} from 'lucide-react';
import { toast } from 'sonner';
import { BrandMark } from '@/components/brand-mark';
import { CartSheet } from '@/components/cart-sheet';
import { CheckoutDialog } from '@/components/checkout-dialog';
import { CreateProductDialog } from '@/components/create-product-dialog';
import { ProductCard } from '@/components/product-card';
import { WorkflowBanner } from '@/components/workflow-banner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api';
import { getInitials } from '@/lib/utils';
import type { Cart, Category, CheckoutResult, CreateProductInput, Product } from '@/types/api';

type WorkspaceData = [Product[], Category[], Cart];

export function CatalogPage() {
  const { session, logout } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [cartOpen, setCartOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [addingSkuId, setAddingSkuId] = useState<number | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);
  const [newlyPublishedId, setNewlyPublishedId] = useState<number | null>(null);
  const searchRequestId = useRef(0);
  const initialLoadPromise = useRef<Promise<WorkspaceData | null> | null>(null);

  const handleUnauthorized = useCallback(
    (cause: unknown) => {
      if (cause instanceof ApiError && cause.status === 401) {
        logout();
        return true;
      }
      return false;
    },
    [logout],
  );

  const fetchWorkspace = useCallback(async (): Promise<WorkspaceData | null> => {
    if (!session) return null;
    return Promise.all([
      api.getProducts(session.token),
      api.getCategories(session.token),
      api.getCart(session.token),
    ]);
  }, [session]);

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const workspace = await fetchWorkspace();
      if (!workspace) return;
      const [productData, categoryData, cartData] = workspace;
      setProducts(productData);
      setCategories(categoryData);
      setCart(cartData);
    } catch (cause) {
      if (handleUnauthorized(cause)) return;
      setLoadError(getErrorMessage(cause, 'The demo workspace could not load from the gateway.'));
    } finally {
      setIsLoading(false);
    }
  }, [fetchWorkspace, handleUnauthorized]);

  useEffect(() => {
    initialLoadPromise.current ??= fetchWorkspace();
    let isActive = true;

    void initialLoadPromise.current
      .then((workspace) => {
        if (!isActive || !workspace) return;
        const [productData, categoryData, cartData] = workspace;
        setProducts(productData);
        setCategories(categoryData);
        setCart(cartData);
      })
      .catch((cause: unknown) => {
        if (!isActive || handleUnauthorized(cause)) return;
        setLoadError(getErrorMessage(cause, 'The demo workspace could not load from the gateway.'));
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [fetchWorkspace, handleUnauthorized]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const itemCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runProductSearch(search, categoryId);
  }

  async function runProductSearch(nextSearch: string, nextCategory: string) {
    if (!session) return;
    const requestId = ++searchRequestId.current;
    setIsSearching(true);
    setLoadError('');
    try {
      const results = await api.getProducts(session.token, {
        name: nextSearch.trim() || undefined,
        categoryId: nextCategory === 'all' ? undefined : Number(nextCategory),
      });
      if (requestId === searchRequestId.current) setProducts(results);
    } catch (cause) {
      if (!handleUnauthorized(cause)) toast.error(getErrorMessage(cause, 'Search failed.'));
    } finally {
      if (requestId === searchRequestId.current) setIsSearching(false);
    }
  }

  function clearFilters() {
    setSearch('');
    setCategoryId('all');
    void runProductSearch('', 'all');
  }

  async function handleAddToCart(skuId: number) {
    if (!session) return;
    setAddingSkuId(skuId);
    try {
      const nextCart = await api.addCartItem(session.token, skuId, 1);
      setCart(nextCart);
      toast.success('Added to cart', {
        description: 'cart-service stored a server-side product snapshot.',
      });
      setCartOpen(true);
    } catch (cause) {
      if (!handleUnauthorized(cause)) {
        toast.error(getErrorMessage(cause, 'Item could not be added.'));
      }
    } finally {
      setAddingSkuId(null);
    }
  }

  async function handleUpdateQuantity(itemId: number, quantity: number) {
    if (!session) return;
    setUpdatingItemId(itemId);
    try {
      setCart(await api.updateCartItem(session.token, itemId, Math.max(0, quantity)));
    } catch (cause) {
      if (!handleUnauthorized(cause)) {
        toast.error(getErrorMessage(cause, 'Quantity could not be updated.'));
      }
    } finally {
      setUpdatingItemId(null);
    }
  }

  async function handleRemoveItem(itemId: number) {
    if (!session) return;
    setUpdatingItemId(itemId);
    try {
      setCart(await api.deleteCartItem(session.token, itemId));
      toast.success('Item removed');
    } catch (cause) {
      if (!handleUnauthorized(cause)) {
        toast.error(getErrorMessage(cause, 'Item could not be removed.'));
      }
    } finally {
      setUpdatingItemId(null);
    }
  }

  async function handleCreateProduct(input: CreateProductInput) {
    if (!session) throw new Error('Your session has expired.');
    try {
      const created = await api.createProduct(session.token, input);
      const normalizedSearch = search.trim().toLocaleLowerCase();
      const matchesCurrentView =
        (!normalizedSearch || created.name.toLocaleLowerCase().includes(normalizedSearch)) &&
        (categoryId === 'all' || created.categoryId === Number(categoryId));

      if (matchesCurrentView) {
        setProducts((current) => [
          created,
          ...current.filter((item) => item.id !== created.id),
        ]);
      }
      setNewlyPublishedId(created.id);
      toast.success('Product created', {
        description: matchesCurrentView
          ? 'The ProductCreated event was published to Kafka.'
          : 'The event was published. Clear the current filters to see the product.',
      });
      return created;
    } catch (cause) {
      if (handleUnauthorized(cause)) {
        throw new Error('Your session has expired.', { cause });
      }
      throw cause;
    }
  }

  async function handleCheckout(): Promise<CheckoutResult> {
    if (!session || !cart) throw new Error('There is no active cart to check out.');
    let result: CheckoutResult;
    try {
      result = await api.checkout(session.token, cart.id);
    } catch (cause) {
      if (handleUnauthorized(cause)) {
        throw new Error('Your session has expired.', { cause });
      }
      throw cause;
    }
    try {
      setCart(await api.getCart(session.token));
    } catch {
      setCart(null);
    }
    return result;
  }

  function openCheckout() {
    setCartOpen(false);
    window.setTimeout(() => setCheckoutOpen(true), 160);
  }

  return (
    <main className="min-h-screen bg-[#f7f5f2] text-foreground">
      <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-[#f7f5f2]/90 backdrop-blur-xl">
        <div className="container flex h-[72px] items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-5">
            <BrandMark compact />
            <span className="hidden h-5 w-px bg-border sm:block" />
            <Badge variant="outline" className="hidden gap-1.5 bg-white/50 text-[10px] sm:flex">
              <span className="size-1.5 rounded-full bg-emerald-500" /> Gateway connected
            </Badge>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              variant="ghost"
              className="relative rounded-xl"
              aria-label={`Open cart with ${itemCount} items`}
              onClick={() => setCartOpen(true)}
            >
              <ShoppingBag />
              <span className="hidden sm:inline">Cart</span>
              {itemCount > 0 && (
                <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {itemCount}
                </span>
              )}
            </Button>
            <div className="ml-1 grid size-9 place-items-center rounded-full bg-[#ded7cc] text-xs font-semibold text-stone-700">
              {getInitials(session?.email ?? 'DE')}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl" onClick={logout}>
                  <LogOut />
                  <span className="sr-only">Sign out</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sign out</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>

      <div className="container space-y-10 pb-16 pt-6 sm:pt-8">
        <WorkflowBanner onCreateProduct={() => setCreateOpen(true)} />

        <section aria-labelledby="catalog-heading">
          <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-primary">
                <Boxes className="size-3.5" /> Live catalog
              </div>
              <h2 id="catalog-heading" className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
                Products from product-service
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Select a real SKU, add it to your cart, then run checkout.
              </p>
            </div>

            <Button variant="outline" className="self-start bg-white lg:self-auto" onClick={() => setCreateOpen(true)}>
              <Plus /> Create product
            </Button>
          </div>

          <form
            onSubmit={(event) => void handleSearch(event)}
            className="mb-6 grid gap-3 rounded-2xl border bg-white p-3 shadow-[0_1px_2px_rgba(25,21,18,0.03)] sm:grid-cols-[1fr_220px_auto]"
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label="Search products by name"
                placeholder="Search products by name…"
                className="border-transparent bg-secondary/60 pl-10 shadow-none focus-visible:bg-white"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select
              value={categoryId}
              onValueChange={(value) => {
                setCategoryId(value);
                void runProductSearch(search, value);
              }}
            >
              <SelectTrigger className="border-transparent bg-secondary/60 shadow-none focus:bg-white">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={String(category.id)}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" variant="secondary" disabled={isSearching}>
              {isSearching ? <LoaderCircle className="animate-spin" /> : <Search />}
              Search
            </Button>
          </form>

          {isLoading ? (
            <ProductGridSkeleton />
          ) : loadError ? (
            <div className="rounded-2xl border border-destructive/20 bg-white px-6 py-12 text-center shadow-soft">
              <CircleAlert className="mx-auto size-7 text-destructive" />
              <h3 className="mt-4 font-semibold">The catalog could not load</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                {loadError}
              </p>
              <Button variant="outline" className="mt-5" onClick={() => void loadWorkspace()}>
                Try again
              </Button>
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-white/50 px-6 py-14 text-center">
              <PackageOpen className="mx-auto size-8 text-muted-foreground" />
              <h3 className="mt-4 font-semibold">No products match this view</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Clear the filters or publish a new demo product.
              </p>
              <Button
                variant="link"
                className="mt-2"
                onClick={clearFilters}
              >
                Clear filters <ArrowRight />
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {products.length} product{products.length === 1 ? '' : 's'} returned
                </span>
                <span className="font-mono uppercase tracking-wider">GET /api/products</span>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    category={categoryById.get(product.categoryId)}
                    isAdding={product.skus.some((sku) => sku.id === addingSkuId)}
                    isNewlyPublished={product.id === newlyPublishedId}
                    onAdd={handleAddToCart}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <footer className="border-t bg-[#f1eee9]">
        <div className="container flex flex-col gap-2 py-7 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Marketflow demo interface</span>
          <span>React + Vite · shadcn/ui · Real gateway APIs</span>
        </div>
      </footer>

      <CartSheet
        cart={cart}
        open={cartOpen}
        onOpenChange={setCartOpen}
        updatingItemId={updatingItemId}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onCheckout={openCheckout}
      />

      <CheckoutDialog
        cart={cart}
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        onConfirm={handleCheckout}
      />

      <CreateProductDialog
        categories={categories}
        sellerId={session?.userId ?? 1}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={handleCreateProduct}
      />
    </main>
  );
}

function getErrorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

function ProductGridSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading products">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="rounded-2xl border bg-white p-2">
          <Skeleton className="aspect-[4/2.7] rounded-xl" />
          <div className="space-y-3 p-3 pt-5">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full" />
            <div className="flex justify-between">
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
