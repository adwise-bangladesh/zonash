import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { listProducts } from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

const productsQuery = (page: number, search: string) =>
  queryOptions({
    queryKey: ["products", page, search],
    queryFn: () => listProducts({ data: { page, perPage: 24, search: search || undefined } }),
  });

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "Shop — Shopdesk" },
      { name: "description", content: "Browse our full product catalog." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(productsQuery(1, "")),
  component: Products,
});

function Products() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data } = useSuspenseQuery(productsQuery(page, search));

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold">Shop</h1>
            <p className="text-sm text-muted-foreground">Browse the full catalog.</p>
          </div>
          <Input
            placeholder="Search products…"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            className="max-w-xs"
          />
        </div>

        {data.error && (
          <div className="mb-6 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm">
            {data.error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
          {data.products.map((p) => (
            <Card key={p.id} className="overflow-hidden p-0">
              <div className="aspect-square bg-muted">
                {p.images[0] ? (
                  <img
                    src={p.images[0].src}
                    alt={p.images[0].alt || p.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="p-3">
                <p className="line-clamp-1 text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.price ? `$${p.price}` : "—"}
                </p>
              </div>
            </Card>
          ))}
        </div>

        {data.products.length === 0 && !data.error && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No products found.
          </p>
        )}

        <div className="mt-8 flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-50"
          >
            Prev
          </button>
          <span className="px-3 py-1 text-sm text-muted-foreground">Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={data.products.length < 24}
            className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </main>
    </div>
  );
}
