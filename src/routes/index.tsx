import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listProducts } from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, Zap, ShieldCheck, BarChart3 } from "lucide-react";

const featuredProductsQuery = queryOptions({
  queryKey: ["featured-products"],
  queryFn: () => listProducts({ data: { page: 1, perPage: 6 } }),
});

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(featuredProductsQuery),
  component: Home,
});

function Home() {
  const { data } = useSuspenseQuery(featuredProductsQuery);
  const products = data.products;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main>
        <section className="relative overflow-hidden border-b border-border/60">
          <div className="mx-auto max-w-7xl px-4 py-20 md:py-28">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
                <Zap className="h-3 w-3 text-primary" />
                Built for high-volume order ops
              </div>
              <h1 className="mt-5 font-display text-5xl font-semibold leading-tight tracking-tight md:text-6xl">
                Sell fast. <br />
                <span className="text-primary">Ship faster.</span>
              </h1>
              <p className="mt-5 max-w-lg text-lg text-muted-foreground">
                A high-performance storefront and industrial order dashboard that runs on your existing
                WooCommerce store. 2,000+ orders/day, realtime updates, role-based access.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/products">
                  <Button size="lg" className="gap-2">
                    Browse the shop <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/auth">
                  <Button size="lg" variant="outline">
                    Staff sign in
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16">
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Zap,
                title: "Blazing storefront",
                body: "SSR + edge caching. Sub-second product pages, LCP under 1.5s on mobile.",
              },
              {
                icon: ShieldCheck,
                title: "Bank-grade security",
                body: "Role-based access, RLS on every table, HMAC-verified webhooks, HIBP passwords.",
              },
              {
                icon: BarChart3,
                title: "Realtime dashboard",
                body: "Live order feed, revenue KPIs, audit trail. Zero WooCommerce calls on list views.",
              },
            ].map((f) => (
              <Card key={f.title} className="p-6">
                <f.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-3 font-display text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-24">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="font-display text-2xl font-semibold">Featured products</h2>
            <Link to="/products" className="text-sm text-primary hover:underline">
              View all →
            </Link>
          </div>
          {data.error && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-4 text-sm text-foreground">
              {data.error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {products.slice(0, 6).map((p) => (
              <Link key={p.id} to="/products" className="group">
                <div className="aspect-square overflow-hidden rounded-md border border-border bg-muted">
                  {p.images[0] ? (
                    <img
                      src={p.images[0].src}
                      alt={p.images[0].alt || p.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      No image
                    </div>
                  )}
                </div>
                <p className="mt-2 line-clamp-1 text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.price ? `$${p.price}` : ""}</p>
              </Link>
            ))}
            {products.length === 0 && !data.error && (
              <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                No products yet. Add products in your WooCommerce store to see them here.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
