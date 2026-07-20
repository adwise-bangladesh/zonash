import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { LayoutGrid } from "lucide-react";
import { listProducts, listCategories } from "@/lib/woo.functions";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { formatBDT } from "@/lib/format";
import type { WooProduct } from "@/lib/woo.server";

const searchSchema = z.object({
  category: z.string().optional(),
  q: z.string().optional(),
  featured: z.boolean().optional(),
  orderby: z.enum(["date", "price", "popularity", "rating", "title"]).optional(),
});

const productsQuery = (
  page: number,
  search: string,
  category: string | undefined,
  featured: boolean | undefined,
  orderby: "date" | "price" | "popularity" | "rating" | "title" | undefined,
) =>
  queryOptions({
    queryKey: ["products", page, search, category ?? "", featured ?? false, orderby ?? ""],
    queryFn: () =>
      listProducts({
        data: { page, perPage: 30, search: search || undefined, category, featured, orderby },
      }),
    staleTime: 60_000,
  });

const catQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: () => listCategories(),
});

export const Route = createFileRoute("/products/")({
  validateSearch: (s) => searchSchema.parse(s),
  loaderDeps: ({ search }) => ({
    category: search.category,
    q: search.q,
    featured: search.featured,
    orderby: search.orderby,
  }),
  head: () => ({
    meta: [
      { title: "Shop — Zonash Fine Jewelry" },
      { name: "description", content: "Browse Zonash's full collection of fine jewelry." },
    ],
  }),
  loader: ({ context, deps }) => {
    context.queryClient.ensureQueryData(
      productsQuery(1, deps.q ?? "", deps.category, deps.featured, deps.orderby),
    );
    context.queryClient.ensureQueryData(catQuery);
  },
  component: Products,
});

function Products() {
  const { category, q: urlQ, featured, orderby } = Route.useSearch();
  const [page, setPage] = useState(1);
  const { data } = useSuspenseQuery(productsQuery(page, urlQ ?? "", category, featured, orderby));
  const { data: catData } = useSuspenseQuery(catQuery);
  const activeCat = catData.categories.find((c) => c.slug === category);
  const products = data.products as WooProduct[];

  const title = urlQ
    ? `Results for "${urlQ}"`
    : activeCat
      ? activeCat.name
      : featured
        ? "Bestsellers"
        : orderby === "date"
          ? "New arrivals"
          : "All jewelry";

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <CheckoutHeader title={title} />
      <main className="min-h-0 flex-1">
        <div className="px-2 pb-24 pt-3 md:px-4 md:py-4">
          {urlQ && (
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
            <EmptyState
              icon={LayoutGrid}
              title={urlQ ? "No matches" : "Nothing here yet"}
              description={urlQ ? `We couldn't find anything for "${urlQ}". Try a different word.` : "Try another filter."}
              primary={{ label: "Browse categories", to: "/categories" }}
            />
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 md:gap-3">
              {products.map((p) => {
                const img = p.images?.[0]?.src;
                const priceNum = parseFloat(p.sale_price && p.on_sale ? p.sale_price : p.price) || 0;
                return (
                  <li key={p.id}>
                    <Link
                      to="/products/$slug"
                      params={{ slug: p.slug }}
                      preload="intent"
                      className="group flex flex-col rounded-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span className="block aspect-square w-full overflow-hidden rounded-[3px] ring-1 ring-border transition-all group-hover:ring-primary/40">
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
                      <span className="mt-1.5 line-clamp-2 text-[12px] font-medium leading-tight text-foreground">
                        {p.name}
                      </span>
                      <span className="mt-0.5 text-[13px] font-bold text-primary">
                        {formatBDT(priceNum)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {products.length > 0 && (
            <div className="mt-8 flex justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-full border border-border px-4 py-2 text-xs uppercase tracking-widest disabled:opacity-40"
              >
                Prev
              </button>
              <span className="px-3 py-2 text-xs text-muted-foreground">Page {page}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={products.length < 30}
                className="rounded-full border border-border px-4 py-2 text-xs uppercase tracking-widest disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
