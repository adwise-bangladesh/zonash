import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listCategories } from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";
import { Gem } from "lucide-react";

const catQuery = queryOptions({
  queryKey: ["categories", "all"],
  queryFn: () => listCategories(),
});

export const Route = createFileRoute("/categories")({
  head: () => ({
    meta: [
      { title: "Collections — Zonash Fine Jewelry" },
      { name: "description", content: "Shop Zonash by collection — rings, necklaces, earrings, bracelets and more." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(catQuery),
  component: Categories,
});

function Categories() {
  const { data } = useSuspenseQuery(catQuery);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-10">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Shop by</p>
          <h1 className="mt-1 font-display text-4xl">Collections</h1>
        </div>

        {data.error && <p className="rounded-md border border-warning/40 bg-warning/10 p-4 text-sm">{data.error}</p>}

        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
          {data.categories.map((c) => (
            <Link key={c.id} to="/products" search={{ category: c.slug }} className="group block">
              <div className="aspect-[4/5] overflow-hidden bg-muted">
                {c.image?.src ? (
                  <img src={c.image.src} alt={c.image.alt || c.name} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                ) : (
                  <div className="flex h-full items-center justify-center"><Gem className="h-12 w-12 text-muted-foreground/40" /></div>
                )}
              </div>
              <p className="mt-4 font-display text-xl">{c.name}</p>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">{c.count} pieces</p>
            </Link>
          ))}
          {data.categories.length === 0 && !data.error && (
            <p className="col-span-full py-16 text-center text-sm text-muted-foreground">No collections yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}
