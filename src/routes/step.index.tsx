import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { z } from "zod";

import { listProducts } from "@/lib/woo.functions";
import type { WooProduct } from "@/lib/woo.server";
import { formatBDT } from "@/lib/format";
import { cardTitle } from "@/lib/card-title";
import { buildResponsiveImage } from "@/lib/product-image";
import { NotFoundView } from "@/components/NotFoundView";
import { SiteHeader } from "@/components/layout/SiteHeader";

const searchSchema = z.object({
  q: z.string().trim().max(120).optional(),
});

const stepListQuery = (search: string | undefined) =>
  queryOptions({
    queryKey: ["step-index", search ?? ""],
    queryFn: () => listProducts({ data: { perPage: 50, search } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/step/")({
  validateSearch: (raw) => searchSchema.parse(raw ?? {}),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(stepListQuery(deps.q)),
  head: () => ({
    meta: [
      { title: "Order now — Zonash" },
      { name: "description", content: "Pick a product to open its instant-order landing page." },
      { property: "og:title", content: "Order now — Zonash" },
      { property: "og:description", content: "Pick a product to open its instant-order landing page." },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: StepIndex,
  // Match the product page: let fast SSR-warm loads skip straight to the real
  // grid instead of flashing the skeleton for one frame.
  pendingMs: 800,
  pendingMinMs: 0,
  pendingComponent: StepIndexSkeleton,
  errorComponent: ({ error, reset }) => (
    <NotFoundView
      variant="error"
      title="Couldn't load products"
      description={error instanceof Error ? error.message : "Please try again."}
      onRetry={() => reset()}
    />
  ),
  notFoundComponent: () => (
    <NotFoundView
      title="Nothing here"
      description="No products available right now."
      primaryLabel="Back to shop"
      primaryTo="/products"
    />
  ),
});

function priceNum(v: string | undefined | null): number {
  if (!v) return 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function StepIndex() {
  const { q } = Route.useSearch();
  // Load once from URL query (SSR-primed). Further filtering is client-side
  // so typing never re-suspends the route or refetches.
  const { data } = useSuspenseQuery(stepListQuery(q));

  const [term, setTerm] = useState(q ?? "");
  const all = data.products ?? [];
  const products = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((p) => {
      const hay = `${p.name} ${p.sku ?? ""} ${p.slug ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [all, term]);

  return (
    <div className="min-h-[100dvh] bg-background pb-8">
      <SiteHeader />
      <div className="sticky top-14 z-30 border-b border-border bg-background/95 backdrop-blur md:top-16">
        <div className="mx-auto flex max-w-[720px] items-center gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="text-[15px] font-extrabold text-foreground">Order now</h1>
            <p className="truncate text-[10.5px] text-muted-foreground">Tap a product to open its instant-order page</p>
          </div>
          <div className="ml-auto flex-1 max-w-[280px]">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" aria-hidden />
              <input
                type="search"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search products…"
                className="h-9 w-full rounded-full border border-border bg-muted/40 pl-9 pr-3 text-[13px] outline-none transition-colors focus:border-primary focus:bg-background"
                aria-label="Search products"
              />
            </div>
          </div>
        </div>
      </div>

      {data?.error && (
        <div className="mx-auto mt-3 max-w-[720px] px-4">
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            {data.error}
          </p>
        </div>
      )}

      {products.length === 0 ? (
        <div className="mx-auto mt-16 max-w-[420px] px-4 text-center">
          <p className="text-sm font-semibold text-foreground">No products found</p>
          <p className="mt-1 text-[12px] text-muted-foreground">Try a different search term.</p>
        </div>
      ) : (
        <ul className="mx-auto mt-3 grid max-w-[720px] grid-cols-2 gap-3 px-3 sm:grid-cols-3">
          {products.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductCard({ product }: { product: WooProduct }) {
  const price = priceNum(product.on_sale && product.sale_price ? product.sale_price : product.price);
  const regular = priceNum(product.regular_price);
  const showStrike = regular > price && regular > 0;
  const imgObj = product.images?.[0];
  const img = imgObj?.src;
  const responsive = imgObj ? buildResponsiveImage(imgObj) : null;
  const outOfStock = product.stock_status === "outofstock";

  return (
    <Link
      to="/step/$slug"
      params={{ slug: product.slug }}
      className="group flex flex-col overflow-hidden rounded-[10px] border border-border bg-card transition-all hover:border-primary/50 hover:shadow-[var(--shadow-card)]"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {img ? (
          <img
            src={responsive?.src ?? img}
            srcSet={responsive?.srcSet}
            sizes={responsive?.sizes}
            alt={product.images?.[0]?.alt || product.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : null}
        {outOfStock && (
          <div className="absolute inset-0 grid place-items-center bg-background/70">
            <span className="rounded-md bg-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-background">
              Sold out
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <h2 className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-foreground">
          {cardTitle(product)}
        </h2>
        <div className="mt-auto flex items-baseline gap-1.5 pt-1">
          <span className="text-[13.5px] font-extrabold text-primary tabular-nums">
            {formatBDT(price)}
          </span>
          {showStrike && (
            <span className="text-[10.5px] text-muted-foreground line-through tabular-nums">
              {formatBDT(regular)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function StepIndexSkeleton() {
  return (
    <div className="min-h-[100dvh] bg-background pb-8">
      <div className="h-14 border-b border-border bg-background" />
      <ul className="mx-auto mt-3 grid max-w-[720px] grid-cols-2 gap-3 px-3 sm:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <li key={i} className="overflow-hidden rounded-[10px] border border-border bg-card">
            <div className="aspect-square w-full animate-pulse bg-muted" />
            <div className="space-y-1.5 p-2.5">
              <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
              <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-3.5 w-1/3 animate-pulse rounded bg-muted" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
