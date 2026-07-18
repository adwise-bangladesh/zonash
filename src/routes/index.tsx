import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listProducts, listCategories } from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Truck, ShieldCheck, Gem } from "lucide-react";
import type { WooProduct } from "@/lib/woo.server";

const featuredQuery = queryOptions({
  queryKey: ["home", "featured"],
  queryFn: () => listProducts({ data: { page: 1, perPage: 8 } }),
});
const catQuery = queryOptions({
  queryKey: ["home", "categories"],
  queryFn: () => listCategories(),
});

export const Route = createFileRoute("/")({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(featuredQuery);
    context.queryClient.ensureQueryData(catQuery);
  },
  component: Home,
});

function Home() {
  const { data: feat } = useSuspenseQuery(featuredQuery);
  const { data: catData } = useSuspenseQuery(catQuery);
  const products = feat.products as WooProduct[];
  const categories = catData.categories;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border/60">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/40 via-background to-background" />
          <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
            <div className="flex flex-col justify-center">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs uppercase tracking-widest text-gold-foreground">
                <Sparkles className="h-3 w-3" /> New arrivals
              </div>
              <h1 className="mt-6 font-display text-5xl leading-[1.05] tracking-tight md:text-7xl">
                Fine jewelry, <br />
                <em className="not-italic text-primary">timeless design.</em>
              </h1>
              <p className="mt-6 max-w-md text-base text-muted-foreground md:text-lg">
                Handcrafted rings, necklaces, earrings and bracelets — made with responsibly-sourced gold, diamonds and precious stones.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/products">
                  <Button size="lg" className="gap-2 rounded-none px-6">
                    Shop the collection <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/categories">
                  <Button size="lg" variant="outline" className="rounded-none px-6">
                    Browse collections
                  </Button>
                </Link>
              </div>
            </div>
            <div className="relative hidden md:block">
              <div className="grid h-full grid-cols-2 gap-3">
                {products.slice(0, 4).map((p, i) => (
                  <Link
                    key={p.id}
                    to="/products/$slug"
                    params={{ slug: p.slug }}
                    className={`group relative overflow-hidden bg-muted ${i === 0 ? "row-span-2" : ""}`}
                  >
                    {p.images[0] ? (
                      <img
                        src={p.images[0].src}
                        alt={p.images[0].alt || p.name}
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        <Gem className="h-8 w-8" />
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Value strip */}
        <section className="border-b border-border/60">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 text-sm sm:grid-cols-3">
            {[
              { icon: Truck, title: "Complimentary shipping", body: "Worldwide, insured & tracked" },
              { icon: ShieldCheck, title: "Lifetime warranty", body: "On every Zonash piece" },
              { icon: Gem, title: "Ethical sourcing", body: "Conflict-free stones & recycled gold" },
            ].map((f) => (
              <div key={f.title} className="flex items-center gap-3">
                <f.icon className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">{f.title}</p>
                  <p className="text-xs text-muted-foreground">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Categories */}
        {categories.length > 0 && (
          <section className="mx-auto max-w-7xl px-4 py-16">
            <div className="mb-8 flex items-end justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Shop by</p>
                <h2 className="mt-1 font-display text-3xl md:text-4xl">Collections</h2>
              </div>
              <Link to="/categories" className="text-sm text-primary hover:underline">
                View all →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {categories.slice(0, 4).map((c) => (
                <Link key={c.id} to="/products" search={{ category: c.slug }} className="group block">
                  <div className="aspect-[4/5] overflow-hidden bg-muted">
                    {c.image?.src ? (
                      <img src={c.image.src} alt={c.image.alt || c.name} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full items-center justify-center"><Gem className="h-10 w-10 text-muted-foreground/50" /></div>
                    )}
                  </div>
                  <p className="mt-3 font-display text-lg">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.count} pieces</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Featured */}
        <section className="mx-auto max-w-7xl px-4 pb-24">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Newly arrived</p>
              <h2 className="mt-1 font-display text-3xl md:text-4xl">Featured pieces</h2>
            </div>
            <Link to="/products" className="text-sm text-primary hover:underline">Shop all →</Link>
          </div>
          {feat.error && (
            <div className="mb-6 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm">{feat.error}</div>
          )}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {products.slice(0, 8).map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
            {products.length === 0 && !feat.error && (
              <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                No products yet. Add products to your store to see them here.
              </p>
            )}
          </div>
        </section>

        <footer className="border-t border-border/60 bg-accent/30">
          <div className="mx-auto max-w-7xl px-4 py-10 text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="font-display text-2xl text-foreground">Zonash</p>
              <p>© {new Date().getFullYear()} Zonash. Fine jewelry, ethically made.</p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

function ProductCard({ p }: { p: WooProduct }) {
  return (
    <Link to="/products/$slug" params={{ slug: p.slug }} className="group block">
      <div className="relative aspect-square overflow-hidden bg-muted">
        {p.images[0] ? (
          <img
            src={p.images[0].src}
            alt={p.images[0].alt || p.name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground/40"><Gem className="h-10 w-10" /></div>
        )}
        {p.on_sale && (
          <span className="absolute left-2 top-2 bg-gold px-2 py-0.5 text-[10px] uppercase tracking-widest text-gold-foreground">Sale</span>
        )}
      </div>
      <div className="mt-3 space-y-0.5">
        <p className="line-clamp-1 text-sm font-medium">{p.name}</p>
        <p className="text-sm text-muted-foreground">
          {p.sale_price && p.on_sale ? (
            <>
              <span className="text-foreground">${p.sale_price}</span>{" "}
              <span className="line-through opacity-60">${p.regular_price}</span>
            </>
          ) : p.price ? `$${p.price}` : "—"}
        </p>
      </div>
    </Link>
  );
}
