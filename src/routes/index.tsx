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
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(featuredQuery),
      context.queryClient.ensureQueryData(trendingQuery),
      context.queryClient.ensureQueryData(catQuery),
    ]);
  },
  component: Home,
  pendingComponent: HomeSkeleton,
});

function HomeSkeleton() {
  return (
    <div className="min-h-screen bg-surface-muted/40">
      <div className="h-14 border-b border-border/60 bg-background" />
      <div className="bg-background">
        <div className="flex gap-3 overflow-hidden px-3 py-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-6 w-16 shrink-0 skeleton-shimmer rounded-full" />
          ))}
        </div>
        <div className="grid grid-cols-5 gap-3 px-3 pb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="h-12 w-12 skeleton-shimmer rounded-full" />
              <div className="h-2.5 w-10 skeleton-shimmer rounded" />
            </div>
          ))}
        </div>
        <div className="mx-[5px] mb-3 h-[124px] skeleton-shimmer rounded-2xl md:container-page" />
      </div>
      <div className="grid grid-cols-2 gap-2 px-[5px] pt-3 md:grid-cols-3 lg:grid-cols-4">

        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="skeleton-shimmer aspect-[3/4] rounded-2xl"
            style={{ animationDelay: `${i * 40}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

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

        <BigProductGrid products={featured} />


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
