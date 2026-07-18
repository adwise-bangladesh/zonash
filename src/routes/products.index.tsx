import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { listProducts, listCategories } from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { Gem } from "lucide-react";
import type { WooProduct } from "@/lib/woo.server";

const searchSchema = z.object({
  category: z.string().optional(),
  q: z.string().optional(),
});

const productsQuery = (page: number, search: string, category: string | undefined) =>
  queryOptions({
    queryKey: ["products", page, search, category ?? ""],
    queryFn: () => listProducts({ data: { page, perPage: 24, search: search || undefined, category } }),
  });

const catQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: () => listCategories(),
});

export const Route = createFileRoute("/products/")({
  validateSearch: (s) => searchSchema.parse(s),
  loaderDeps: ({ search }) => ({ category: search.category, q: search.q }),
  head: () => ({
    meta: [
      { title: "Shop — Zonash Fine Jewelry" },
      { name: "description", content: "Browse Zonash's full collection of fine jewelry — rings, necklaces, earrings and bracelets." },
    ],
  }),
  loader: ({ context, deps }) => {
    context.queryClient.ensureQueryData(productsQuery(1, deps.q ?? "", deps.category));
    context.queryClient.ensureQueryData(catQuery);
  },
  component: Products,
});

function Products() {
  const { category } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data } = useSuspenseQuery(productsQuery(page, search, category));
  const { data: catData } = useSuspenseQuery(catQuery);
  const activeCat = catData.categories.find((c) => c.slug === category);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {activeCat ? "Collection" : "Shop"}
          </p>
          <h1 className="mt-1 font-display text-4xl">
            {activeCat ? activeCat.name : "All jewelry"}
          </h1>
        </div>

        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setPage(1); navigate({ search: {} }); }}
              className={`border px-3 py-1 text-xs uppercase tracking-widest ${!category ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-foreground"}`}
            >
              All
            </button>
            {catData.categories.slice(0, 10).map((c) => (
              <button
                key={c.id}
                onClick={() => { setPage(1); navigate({ search: { category: c.slug } }); }}
                className={`border px-3 py-1 text-xs uppercase tracking-widest ${category === c.slug ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-foreground"}`}
              >
                {c.name}
              </button>
            ))}
          </div>
          <Input
            placeholder="Search jewelry…"
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            className="max-w-xs rounded-none"
          />
        </div>

        {data.error && (
          <div className="mb-6 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm">{data.error}</div>
        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {(data.products as WooProduct[]).map((p) => (
            <Link key={p.id} to="/products/$slug" params={{ slug: p.slug }} className="group block">
              <div className="relative aspect-square overflow-hidden bg-muted">
                {p.images[0] ? (
                  <img src={p.images[0].src} alt={p.images[0].alt || p.name} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground/40"><Gem className="h-10 w-10" /></div>
                )}
                {p.on_sale && (
                  <span className="absolute left-2 top-2 bg-gold px-2 py-0.5 text-[10px] uppercase tracking-widest text-gold-foreground">Sale</span>
                )}
              </div>
              <div className="mt-3">
                <p className="line-clamp-1 text-sm font-medium">{p.name}</p>
                <p className="text-sm text-muted-foreground">
                  {p.sale_price && p.on_sale ? (
                    <><span className="text-foreground">${p.sale_price}</span>{" "}<span className="line-through opacity-60">${p.regular_price}</span></>
                  ) : p.price ? `$${p.price}` : "—"}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {data.products.length === 0 && !data.error && (
          <p className="py-16 text-center text-sm text-muted-foreground">No pieces found.</p>
        )}

        <div className="mt-10 flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="border border-border px-4 py-2 text-xs uppercase tracking-widest disabled:opacity-40"
          >
            Prev
          </button>
          <span className="px-3 py-2 text-xs text-muted-foreground">Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={data.products.length < 24}
            className="border border-border px-4 py-2 text-xs uppercase tracking-widest disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </main>
    </div>
  );
}
