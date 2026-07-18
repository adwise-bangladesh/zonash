import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, queryOptions } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { LayoutGrid } from "lucide-react";
import { listCategories, listProducts } from "@/lib/woo.functions";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { formatBDT } from "@/lib/format";

const searchSchema = z.object({
  parent: z.string().min(1).max(96).regex(/^[a-z0-9-]+$/).optional().catch(undefined),
});

const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: () => listCategories(),
});

const productsByCategoryQuery = (id: number) =>
  queryOptions({
    queryKey: ["products", "by-cat", id],
    queryFn: () => listProducts({ data: { page: 1, perPage: 30, category: String(id) } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/categories")({
  validateSearch: (s) => searchSchema.parse(s),
  loader: ({ context }) => context.queryClient.ensureQueryData(categoriesQuery),
  head: () => ({
    meta: [
      { title: "Shop by category — Zonash" },
      { name: "description", content: "Browse every jewelry category at Zonash." },
      { property: "og:title", content: "Shop by category — Zonash" },
      { property: "og:description", content: "Explore rings, chains, earrings and more." },
    ],
  }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const { parent } = Route.useSearch();
  const navigate = useNavigate({ from: "/categories" });
  const { data } = useSuspenseQuery(categoriesQuery);
  const cats = data.categories;

  if (!cats.length) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <CheckoutHeader title="Categories" />
        <main className="flex flex-1 items-center justify-center">
          <EmptyState icon={LayoutGrid} title="No categories yet" description="Check back soon — we're stocking the shelves." primary={{ label: "Continue shopping", to: "/products" }} />
        </main>
      </div>
    );
  }

  const activeSlug = parent ?? cats[0].slug;
  const active = cats.find((c) => c.slug === activeSlug) ?? cats[0];
  const parentMissing = !!parent && !cats.some((c) => c.slug === parent);

  const railRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const el = rail.querySelector<HTMLElement>(`[data-slug="${activeSlug}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeSlug]);

  const selectCategory = (slug: string) => {
    if (slug === activeSlug) return;
    void navigate({ search: { parent: slug }, replace: true });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <CheckoutHeader title="Categories" showBack={false} />
      <main className="min-h-0 flex-1">
        <div className="grid min-h-[calc(100dvh-44px)] w-full grid-cols-[88px_minmax(0,1fr)] md:grid-cols-[140px_minmax(0,1fr)] lg:grid-cols-[160px_minmax(0,1fr)]">
          {/* Left rail: parent categories */}
          <aside className="border-r border-border bg-surface-muted">
            <nav aria-label="Parent categories" className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <ul ref={railRef} className="pb-24 md:pb-3">
                {cats.map((c) => {
                  const isActive = c.slug === activeSlug;
                  return (
                    <li key={c.slug} data-slug={c.slug}>
                      <button
                        type="button"
                        onClick={() => selectCategory(c.slug)}
                        aria-pressed={isActive}
                        className={`relative flex w-full flex-col items-center gap-1 px-1 py-3 text-center transition-colors ${
                          isActive ? "bg-background text-primary" : "text-foreground hover:bg-background/60"
                        }`}
                      >
                        {isActive && (
                          <span aria-hidden="true" className="absolute left-0 top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-r bg-primary md:h-7" />
                        )}
                        <span className={`block h-14 w-14 overflow-hidden rounded-[3px] ring-1 md:h-16 md:w-16 ${isActive ? "ring-primary/50" : "ring-border"}`}>
                          {c.image?.src ? (
                            <img src={c.image.src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                          ) : (
                            <span className="grid h-full w-full place-items-center bg-muted text-muted-foreground"><LayoutGrid className="h-5 w-5" /></span>
                          )}
                        </span>
                        <span className={`block w-full break-words px-0.5 text-[10px] font-medium leading-tight md:text-[11px] ${isActive ? "text-primary" : "text-foreground"}`}>
                          {c.name}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          {/* Right pane: products in active category */}
          <section className="min-h-0 overflow-y-auto">
            {parentMissing ? (
              <EmptyState icon={LayoutGrid} title="Category not found" description={`"${parent}" doesn't exist. Pick a category from the list.`} />
            ) : (
              <CategoryProducts id={active.id} slug={active.slug} name={active.name} />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function CategoryProducts({ id, slug, name }: { id: number; slug: string; name: string }) {
  const { data, isLoading } = useQuery(productsByCategoryQuery(id));
  const products = data?.products ?? [];

  return (
    <div className="px-2 pb-24 pt-3 md:px-4 md:py-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-lg md:text-xl">{name}</h2>
        <Link to="/products" search={{ category: slug } as never} className="text-xs font-medium text-primary hover:underline">
          View all →
        </Link>
      </div>

      {isLoading ? (
        <GridSkeleton />
      ) : products.length === 0 ? (
        <EmptyState compact icon={LayoutGrid} title="Nothing here yet" description="Try another category." />
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 md:gap-3">
          {products.map((p) => {
            const img = p.images?.[0]?.src;
            const priceNum = parseFloat(p.sale_price && p.on_sale ? p.sale_price : p.price) || 0;
            return (
              <li key={p.id}>
                <Link to="/products/$slug" params={{ slug: p.slug }} className="group flex flex-col rounded-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <span className="block aspect-square w-full overflow-hidden rounded-[3px] ring-1 ring-border transition-all group-hover:ring-primary/40">
                    {img ? (
                      <img src={img} alt={p.name} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />
                    ) : (
                      <span className="grid h-full w-full place-items-center bg-muted" />
                    )}
                  </span>
                  <span className="mt-1.5 line-clamp-2 text-[12px] font-medium leading-tight text-foreground">{p.name}</span>
                  <span className="mt-0.5 text-[13px] font-bold text-primary">{formatBDT(priceNum)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function GridSkeleton() {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 md:gap-3">
      {Array.from({ length: 10 }).map((_, i) => (
        <li key={i} className="flex flex-col gap-1.5">
          <span className="block aspect-square w-full animate-pulse rounded-[3px] bg-surface-muted" />
          <span className="h-3 w-3/4 animate-pulse rounded-[3px] bg-surface-muted" />
          <span className="h-3 w-1/2 animate-pulse rounded-[3px] bg-surface-muted" />
        </li>
      ))}
    </ul>
  );
}
