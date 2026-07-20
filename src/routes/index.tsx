import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listProducts, listCategories } from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";

import { CategoryTabs } from "@/components/home/CategoryTabs";
import { PromoIcons } from "@/components/home/PromoIcons";
import { DealsStrip } from "@/components/home/DealsStrip";
import { BigProductGrid } from "@/components/home/BigProductGrid";
import { InfiniteFeed } from "@/components/home/InfiniteFeed";
import { TrustRow } from "@/components/home/TrustRow";
import type { WooProduct } from "@/lib/woo.server";

const featuredQuery = queryOptions({
  queryKey: ["home", "featured"],
  queryFn: () => listProducts({ data: { page: 1, perPage: 12 } }),
});
const trendingQuery = queryOptions({
  queryKey: ["home", "trending"],
  queryFn: () => listProducts({ data: { page: 1, perPage: 16, orderby: "popularity" } }),
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
  const featured = feat.products as WooProduct[];
  const trending = trend.products as WooProduct[];
  const categories = catData.categories;

  return (
    <div className="min-h-screen bg-surface-muted/40">
      <AppHeader />
      <main>
        <div className="bg-background">
          
          <CategoryTabs categories={categories} />
          <PromoIcons />
          <DealsStrip products={trending.length ? trending : featured} />
        </div>

        <BigProductGrid products={featured} title="Featured for you" />
        <BigProductGrid products={trending} title="Trending now" />

        <InfiniteFeed />

        <TrustRow />

        {feat.error && (
          <div className="container-page py-6">
            <div className="rounded-[3px] border border-warning/40 bg-warning/10 p-4 text-sm">{feat.error}</div>
          </div>
        )}
      </main>
    </div>
  );
}
