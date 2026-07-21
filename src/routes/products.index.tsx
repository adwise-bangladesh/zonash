import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { LayoutGrid } from "lucide-react";

import { listProducts, listPrimaryCategories, type WooCategory } from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";
import { InfiniteFeed } from "@/components/home/InfiniteFeed";
import { SortTabs, sortToWoo, type SortKey } from "@/components/products/SortTabs";
import { NotFoundView } from "@/components/NotFoundView";
import { formatBDT } from "@/lib/format";
import { getFeedNextPageParam, FEED_PER_PAGE } from "@/lib/home-feed";
import type { WooProduct } from "@/lib/woo.server";

const primaryCategoriesQuery = queryOptions({
  queryKey: ["categories", "primary"],
  queryFn: () => listPrimaryCategories(),
  staleTime: 5 * 60_000,
});


const SORT_KEYS = ["recommended", "new", "price-asc", "price-desc", "rating", "title"] as const;

const searchSchema = z.object({
  sort: z.enum(SORT_KEYS).optional(),
  q: z.string().optional(),
  category: z.string().optional(),
  featured: z.boolean().optional(),
});

const searchProductsQuery = (
  search: string,
  category: string | undefined,
  featured: boolean | undefined,
  sort: SortKey,
) => {
  const { orderby, order } = sortToWoo(sort);
  return queryOptions({
    queryKey: ["products", "search", search, category ?? "", featured ?? false, sort],
    queryFn: () =>
      listProducts({
        data: { page: 1, perPage: 30, search: search || undefined, category, featured, orderby, order },
      }),
    staleTime: 60_000,
  });
};

export const Route = createFileRoute("/products/")({
  validateSearch: (s) => searchSchema.parse(s),
  loaderDeps: ({ search }) => ({
    q: search.q,
    category: search.category,
    featured: search.featured,
    sort: search.sort ?? "recommended",
  }),
  head: () => ({
    meta: [
      { title: "Shop — Zonash Fine Jewelry" },
      { name: "description", content: "Browse Zonash's full collection of fine jewelry." },
    ],
  }),
  loader: async ({ context, deps }) => {
    const sort = deps.sort as SortKey;
    if (deps.q || deps.featured) {
      await context.queryClient.ensureQueryData(
        searchProductsQuery(deps.q ?? "", deps.category, deps.featured, sort),
      );
      return;
    }
    const { orderby, order } = sortToWoo(sort);
    const isDefault = orderby === "date" && !order;
    const key = isDefault
      ? ["home", "feed", FEED_PER_PAGE]
      : ["home", "feed", FEED_PER_PAGE, orderby, order ?? "desc"];
    void context.queryClient
      .prefetchInfiniteQuery({
        queryKey: key,
        initialPageParam: 1,
        queryFn: ({ pageParam }) =>
          listProducts({
            data: { page: pageParam as number, perPage: FEED_PER_PAGE, orderby, order },
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
  const { q, category, featured, sort } = Route.useSearch();
  const activeSort = (sort ?? "recommended") as SortKey;
  if (q || featured) {
    return <FilteredResults q={q} category={category} featured={featured} sort={activeSort} />;
  }
  return <Shop sort={activeSort} />;
}

function Shop({ sort }: { sort: SortKey }) {
  const { orderby, order } = sortToWoo(sort);
  return (
    <div className="min-h-screen bg-surface-muted/40">
      <AppHeader />
      <SortTabs active={sort} />
      <main className="animate-fade-in">
        <InfiniteFeed orderby={orderby} order={order} />
      </main>
    </div>
  );
}

function FilteredResults({
  q,
  category,
  featured,
  sort,
}: {
  q: string | undefined;
  category: string | undefined;
  featured: boolean | undefined;
  sort: SortKey;
}) {
  const { data } = useSuspenseQuery(searchProductsQuery(q ?? "", category, featured, sort));
  const products = data.products as WooProduct[];

  return (
    <div className="min-h-screen bg-surface-muted/40">
      <AppHeader />
      <SortTabs active={sort} />
      <main className="animate-fade-in">
        <div className="px-[5px] pb-24 pt-3">
          {q && (
            <p className="mb-3 text-xs text-muted-foreground">
              {products.length} result{products.length === 1 ? "" : "s"}
            </p>
          )}

          {data.error && (
            <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              {data.error}
            </div>
          )}

          {products.length === 0 && !data.error ? (
            <NotFoundView
              bare
              variant={q ? "not-found" : "empty"}
              title={q ? "No matches found" : "Nothing here yet"}
              description={
                q
                  ? `We couldn't find anything for "${q}". Try a different word or browse the shop.`
                  : "Try another filter or browse the full shop."
              }
              primaryLabel="Browse shop"
              primaryTo="/products"
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
