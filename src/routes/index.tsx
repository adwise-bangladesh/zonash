import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listProducts, listCategories } from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { HomeHero } from "@/components/home/HomeHero";
import { CategoryStrip } from "@/components/home/CategoryStrip";
import { TrustRow } from "@/components/home/TrustRow";
import { ProductCard } from "@/components/plp/ProductCard";
import type { WooProduct } from "@/lib/woo.server";

const featuredQuery = queryOptions({
  queryKey: ["home", "featured"],
  queryFn: () => listProducts({ data: { page: 1, perPage: 12 } }),
});
const trendingQuery = queryOptions({
  queryKey: ["home", "trending"],
  queryFn: () => listProducts({ data: { page: 1, perPage: 12, orderby: "popularity" } }),
});
const catQuery = queryOptions({
  queryKey: ["home", "categories"],
  queryFn: () => listCategories(),
});

export const Route = createFileRoute("/")({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(featuredQuery);
    context.queryClient.ensureQueryData(trendingQuery);
    context.queryClient.ensureQueryData(catQuery);
  },
  component: Home,
});

function Home() {
  const { data: feat } = useSuspenseQuery(featuredQuery);
  const { data: trend } = useSuspenseQuery(trendingQuery);
  const { data: catData } = useSuspenseQuery(catQuery);
  const products = feat.products as WooProduct[];
  const trending = trend.products as WooProduct[];
  const categories = catData.categories;

  const chips = categories.slice(0, 6).map((c) => ({ name: c.name, slug: c.slug }));

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main>
        <HomeHero chips={chips} />

        <CategoryStrip categories={categories} />

        {/* Featured */}
        {products.length > 0 && (
          <section className="bg-background py-8 md:py-12">
            <div className="container-page">
              <div className="mb-5 flex items-end justify-between md:mb-8">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Newly arrived</p>
                  <h2 className="mt-1 font-display text-2xl md:text-3xl">Featured pieces</h2>
                </div>
                <Link to="/products" className="text-sm font-medium text-primary hover:underline">
                  Shop all →
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3 lg:grid-cols-6">
                {products.slice(0, 12).map((p) => (
                  <ProductCard key={p.id} p={p} />
                ))}
              </div>
            </div>
          </section>
        )}

        <TrustRow />

        {/* Trending */}
        {trending.length > 0 && (
          <section className="bg-surface-muted py-8 md:py-12">
            <div className="container-page">
              <div className="mb-5 flex items-end justify-between md:mb-8">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Most loved</p>
                  <h2 className="mt-1 font-display text-2xl md:text-3xl">Trending now</h2>
                </div>
                <Link to="/products" className="text-sm font-medium text-primary hover:underline">
                  Explore →
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3 lg:grid-cols-6">
                {trending.slice(0, 12).map((p) => (
                  <ProductCard key={p.id} p={p} />
                ))}
              </div>
            </div>
          </section>
        )}

        {feat.error && (
          <div className="container-page py-6">
            <div className="rounded-[3px] border border-warning/40 bg-warning/10 p-4 text-sm">{feat.error}</div>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
