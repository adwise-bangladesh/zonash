import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { LayoutGrid } from "lucide-react";
import { listProducts, listCategories } from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";
import { CategoryTabs } from "@/components/home/CategoryTabs";
import { InfiniteFeed } from "@/components/home/InfiniteFeed";
import { EmptyState } from "@/components/ui/empty-state";
import { formatBDT } from "@/lib/format";
import { getFeedNextPageParam, FEED_PER_PAGE, feedQueryKey } from "@/lib/home-feed";
import type { WooProduct } from "@/lib/woo.server";

const searchSchema = z.object({
  category: z.string().optional(),
  q: z.string().optional(),
  featured: z.boolean().optional(),
  orderby: z.enum(["date", "price", "popularity", "rating", "title"]).optional(),
});

const catQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: () => listCategories(),
  staleTime: 5 * 60_000,
});

const searchProductsQuery = (
  search: string,
  category: string | undefined,
  featured: boolean | undefined,
  orderby: "date" | "price" | "popularity" | "rating" | "title" | undefined,
) =>
  queryOptions({
    queryKey: ["products", "search", search, category ?? "", featured ?? false, orderby ?? ""],
    queryFn: () =>
      listProducts({
        data: { page: 1, perPage: 30, search: search || undefined, category, featured, orderby },
      }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/products/")({
  validateSearch: (s) => searchSchema.parse(s),
  loaderDeps: ({ search }) => ({
    q: search.q,
    category: search.category,
    featured: search.featured,
    orderby: search.orderby,
  }),
  head: () => ({
    meta: [
      { title: "Shop — Zonash Fine Jewelry" },
      { name: "description", content: "Browse Zonash's full collection of fine jewelry." },
    ],
  }),
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(catQuery);
    if (deps.q || deps.featured || deps.orderby) {
      await context.queryClient.ensureQueryData(
        searchProductsQuery(deps.q ?? "", deps.category, deps.featured, deps.orderby),
      );
      return;
    }
    // Warm the infinite feed's first page so scrolling feels instant.
    void context.queryClient
      .prefetchInfiniteQuery({
        queryKey: [...feedQueryKey],
        initialPageParam: 1,
        queryFn: ({ pageParam }) =>
          listProducts({
            data: { page: pageParam as number, perPage: FEED_PER_PAGE, orderby: "date" },
          }),
        getNextPageParam: (last: { products: WooProduct[] }, all: { products: WooProduct[] }[]) =>
          getFeedNextPageParam(last, all, FEED_PER_PAGE),
        staleTime: 60_000,
      })
      .catch(() => {});
  },
  component: Products,
});

function Products() {
  const { q, category, featured, orderby } = Route.useSearch();
  if (q || featured || orderby) {
    return <FilteredResults q={q} category={category} featured={featured} orderby={orderby} />;
  }
  return <Shop />;
}

function Shop() {
  const { data: catData } = useSuspenseQuery(catQuery);
  return (
    <div className="min-h-screen bg-surface-muted/40">
      <AppHeader />
      <CategoryTabs categories={catData.categories} />
      <main className="animate-fade-in">
        <InfiniteFeed />
      </main>
    </div>
  );
}

function FilteredResults({
  q,
  category,
  featured,
  orderby,
}: {
  q: string | undefined;
  category: string | undefined;
  featured: boolean | undefined;
  orderby: "date" | "price" | "popularity" | "rating" | "title" | undefined;
}) {
  const { data } = useSuspenseQuery(searchProductsQuery(q ?? "", category, featured, orderby));
  const { data: catData } = useSuspenseQuery(catQuery);
  const activeCat = catData.categories.find((c) => c.slug === category);
  const products = data.products as WooProduct[];

  return (
    <div className="min-h-screen bg-surface-muted/40">
      <AppHeader />
      <CategoryTabs categories={catData.categories} />
      <main className="animate-fade-in">
        <div className="px-[5px] pb-24 pt-3">
          {q && (
            <p className="mb-3 text-xs text-muted-foreground">
              {products.length} result{products.length === 1 ? "" : "s"}
              {activeCat ? ` in ${activeCat.name}` : ""}
            </p>
          )}

          {data.error && (
            <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              {data.error}
            </div>
          )}

          {products.length === 0 && !data.error ? (
            <EmptyState
              icon={LayoutGrid}
              title={q ? "No matches" : "Nothing here yet"}
              description={
                q ? `We couldn't find anything for "${q}". Try a different word.` : "Try another filter."
              }
              primary={{ label: "Browse shop", to: "/products" }}
            />
          ) : (
            <ProductGrid products={products} />
          )}
        </div>
      </main>
    </div>
  );
}

function ProductGrid({ products }: { products: WooProduct[] }) {
  return (
    <ul className="grid grid-cols-3 gap-1.5">
      {products.map((p) => {
        const img = p.images?.[0]?.src;
        const priceNum = parseFloat(p.sale_price && p.on_sale ? p.sale_price : p.price) || 0;
        return (
          <li key={p.id}>
            <Link
              to="/products/$slug"
              params={{ slug: p.slug }}
              preload="intent"
              className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-border/60 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="block aspect-square w-full overflow-hidden">
                {img ? (
                  <img
                    src={img}
                    alt={p.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center bg-muted" />
                )}
              </span>
              <span className="flex flex-col gap-0.5 p-2">
                <span className="line-clamp-2 text-[12px] font-medium leading-tight text-foreground">
                  {p.name}
                </span>
                <span className="mt-0.5 text-[13px] font-bold text-primary">{formatBDT(priceNum)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
