import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listProducts, listCategories } from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { ArrowRight, Truck, ShieldCheck, Gem, Sparkles } from "lucide-react";
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
  const heroImg = products[0]?.images[0]?.src;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main>
        {/* Hero banner */}
        <section className="relative isolate overflow-hidden border-b border-border/60">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 md:grid-cols-[1.05fr_1fr] md:gap-16 md:py-24">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-gold-foreground">
                <Sparkles className="h-3 w-3" /> New season
              </div>
              <h1 className="mt-6 font-display text-5xl leading-[1.02] tracking-tight md:text-7xl">
                Quiet luxury,<br />
                <em className="not-italic text-primary">daily worn.</em>
              </h1>
              <p className="mt-6 max-w-md text-base text-muted-foreground md:text-lg">
                Handcrafted gold-plated jewelry with a two-year colour guarantee. Waterproof, skin-safe, and made to be lived in.
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
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted md:aspect-[5/6]">
              {heroImg ? (
                <img src={heroImg} alt="Featured piece" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Gem className="h-16 w-16 text-muted-foreground/30" />
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-foreground/5" />
            </div>
          </div>
        </section>

        {/* Value strip */}
        <section className="border-b border-border/60 bg-accent/20">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-6 text-sm sm:grid-cols-3">
            {[
              { icon: Truck, title: "Free shipping", body: "On all orders over ৳1000" },
              { icon: ShieldCheck, title: "2-year guarantee", body: "Colour & finish protected" },
              { icon: Gem, title: "Skin-safe", body: "Nickel-free, waterproof" },
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
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Shop by</p>
                <h2 className="mt-1 font-display text-3xl md:text-4xl">Collections</h2>
              </div>
              <Link to="/categories" className="text-sm text-primary hover:underline">View all →</Link>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {categories.slice(0, 4).map((c) => (
                <Link key={c.id} to="/products" search={{ category: c.slug }} className="group block">
                  <div className="relative aspect-[4/5] overflow-hidden bg-muted">
                    {c.image?.src ? (
                      <img src={c.image.src} alt={c.image.alt || c.name} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full items-center justify-center"><Gem className="h-10 w-10 text-muted-foreground/40" /></div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/80 to-transparent p-4">
                      <p className="font-display text-lg text-foreground">{c.name}</p>
                      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{c.count} pieces</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Featured */}
        <section className="mx-auto max-w-7xl px-4 pb-24">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Newly arrived</p>
              <h2 className="mt-1 font-display text-3xl md:text-4xl">Featured pieces</h2>
            </div>
            <Link to="/products" className="text-sm text-primary hover:underline">Shop all →</Link>
          </div>
          {feat.error && (
            <div className="mb-6 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm">{feat.error}</div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
            {products.slice(0, 8).map((p) => <ProductCard key={p.id} p={p} />)}
            {products.length === 0 && !feat.error && (
              <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                No products yet.
              </p>
            )}
          </div>
        </section>

        <footer className="border-t border-border/60 bg-accent/30">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-10 text-sm text-muted-foreground">
            <p className="font-display text-2xl text-foreground">Zonash</p>
            <p>© {new Date().getFullYear()} Zonash. Fine jewelry, ethically made.</p>
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
            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground/40"><Gem className="h-10 w-10" /></div>
        )}
        {p.on_sale && (
          <span className="absolute left-3 top-3 bg-foreground px-2 py-0.5 text-[10px] uppercase tracking-widest text-background">Sale</span>
        )}
      </div>
      <div className="mt-3 space-y-1">
        <p className="line-clamp-1 text-sm">{p.name}</p>
        <p className="text-sm">
          {p.sale_price && p.on_sale ? (
            <>
              <span className="text-foreground">৳{p.sale_price}</span>{" "}
              <span className="text-muted-foreground line-through opacity-70">৳{p.regular_price}</span>
            </>
          ) : p.price ? (
            <span className="text-foreground">৳{p.price}</span>
          ) : "—"}
        </p>
      </div>
    </Link>
  );
}
