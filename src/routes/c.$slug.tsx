import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useInfiniteQuery, queryOptions } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Loader2, LayoutGrid } from "lucide-react";
import { getCategoryWithSubs, listProducts } from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";
import { BigProductGrid } from "@/components/home/BigProductGrid";
import { EmptyState } from "@/components/ui/empty-state";
import type { WooProduct } from "@/lib/woo.server";

const categoryQuery = (slug: string) =>
  queryOptions({
    queryKey: ["collection", slug],
    queryFn: () => getCategoryWithSubs({ data: { slug } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/c/$slug")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(categoryQuery(params.slug)),
  head: ({ params }) => {
    const pretty = params.slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    return {
      meta: [
        { title: `${pretty} — Zonash` },
        { name: "description", content: `Shop ${pretty} at Zonash.` },
        { property: "og:title", content: `${pretty} — Zonash` },
        { property: "og:description", content: `Curated ${pretty} collection from Zonash.` },
      ],
    };
  },
  component: CollectionPage,
  pendingComponent: CollectionSkeleton,
  errorComponent: ({ error }) => (
    <div className="min-h-screen bg-surface-muted/40">
      <AppHeader />
      <main className="container-page py-10">
        <EmptyState icon={LayoutGrid} title="Couldn't load this collection" description={error.message} />
      </main>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen bg-surface-muted/40">
      <AppHeader />
      <main className="container-page py-10">
        <EmptyState icon={LayoutGrid} title="Collection not found" description="This category doesn't exist yet." primary={{ label: "Browse all", to: "/products" }} />
      </main>
    </div>
  ),
});

function CollectionPage() {
  const { slug } = Route.useParams();
  if (slug === "demo") return <DemoCollection />;
  const { data } = useSuspenseQuery(categoryQuery(slug));
  const parent = data.parent;
  const subs = data.subs;

  return (
    <div className="min-h-screen bg-surface-muted/40">
      <AppHeader />
      <main>
        <div className="bg-background pt-2">
          {subs.length > 0 && <SubcategoryStrip parentSlug={slug} subs={subs} />}
        </div>

        <CategoryProductFeed categoryId={parent?.id ?? null} />
      </main>
    </div>
  );
}

function SubcategoryStrip({
  parentSlug,
  subs,
}: {
  parentSlug: string;
  subs: { id: number; name: string; slug: string; image: { src: string; alt: string } | null }[];
}) {
  const many = subs.length > 5;
  return (
    <nav aria-label="Subcategories" className="pb-4">
      {many ? (
        <ul
          className="flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-px-[5px] px-[5px] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {subs.map((s) => (
            <li
              key={s.id}
              className="shrink-0 basis-[18%] snap-start md:basis-[14%] lg:basis-[10%]"
            >
              <SubCard parentSlug={parentSlug} sub={s} />
            </li>
          ))}
        </ul>
      ) : (
        <ul
          className="grid gap-2 px-[5px]"
          style={{ gridTemplateColumns: `repeat(${subs.length}, minmax(0, 1fr))` }}
        >
          {subs.map((s) => (
            <li key={s.id}>
              <SubCard parentSlug={parentSlug} sub={s} />
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

function SubCard({
  parentSlug,
  sub,
}: {
  parentSlug: string;
  sub: { id: number; name: string; slug: string; image: { src: string; alt: string } | null };
}) {
  return (
    <Link
      to="/c/$slug"
      params={{ slug: sub.slug }}
      preload="intent"
      className="group flex flex-col items-center gap-1.5"
      aria-label={`${sub.name} in ${parentSlug}`}
    >
      <span className="block aspect-square w-full overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-border/60 transition-shadow group-hover:shadow-md">
        {sub.image?.src ? (
          <img
            src={sub.image.src}
            alt={sub.image.alt || sub.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="grid h-full w-full place-items-center bg-surface-muted text-muted-foreground/60">
            <LayoutGrid className="h-5 w-5" />
          </span>
        )}
      </span>
      <span className="line-clamp-2 text-center text-[11px] font-medium leading-tight text-ink md:text-[12px]">
        {sub.name}
      </span>
    </Link>
  );
}

function CategoryProductFeed({ categoryId }: { categoryId: number | null }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const enabled = !!categoryId;

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ["collection", "feed", categoryId],
      enabled,
      initialPageParam: 1,
      queryFn: ({ pageParam }) =>
        listProducts({
          data: {
            page: pageParam as number,
            perPage: 16,
            category: String(categoryId),
            orderby: "date",
          },
        }),
      getNextPageParam: (last, all) =>
        last.products.length < 16 ? undefined : all.length + 1,
      staleTime: 60_000,
    });

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const products: WooProduct[] =
    data?.pages.flatMap((p) => p.products as WooProduct[]) ?? [];

  if (!enabled) {
    return (
      <div className="container-page py-10">
        <EmptyState icon={LayoutGrid} title="Collection unavailable" description="This collection isn't set up yet." />
      </div>
    );
  }

  if (isLoading && products.length === 0) return <FeedSkeleton />;

  if (products.length === 0) {
    return (
      <div className="container-page py-10">
        <EmptyState icon={LayoutGrid} title="Nothing here yet" description="Check back soon — restocking now." primary={{ label: "Browse all", to: "/products" }} />
      </div>
    );
  }

  return (
    <>
      <BigProductGrid products={products} />
      <div ref={sentinel} className="flex items-center justify-center py-6 text-muted-foreground">
        {isFetchingNextPage && (
          <span className="inline-flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading more…
          </span>
        )}
        {!hasNextPage && products.length > 0 && (
          <span className="text-xs text-muted-foreground/70">You've reached the end ✦</span>
        )}
      </div>
    </>
  );
}

function FeedSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 px-[5px] pt-3 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="skeleton-shimmer aspect-[3/4] rounded-2xl"
          style={{ animationDelay: `${i * 40}ms` }}
        />
      ))}
    </div>
  );
}

function CollectionSkeleton() {
  return (
    <div className="min-h-screen bg-surface-muted/40">
      <div className="h-14 border-b border-border/60 bg-background" />
      <div className="bg-background pt-3">
        <div className="container-page mb-3 h-5 w-40 skeleton-shimmer rounded" />
        <div className="flex gap-2 overflow-hidden px-[5px] pb-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="basis-[18%] shrink-0">
              <div className="aspect-square w-full skeleton-shimmer rounded-2xl" />
              <div className="mx-auto mt-1.5 h-2.5 w-3/4 skeleton-shimmer rounded" />
            </div>
          ))}
        </div>
      </div>
      <FeedSkeleton />
    </div>
  );
}
