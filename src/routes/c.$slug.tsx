import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useInfiniteQuery, queryOptions } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { Loader2, LayoutGrid } from "lucide-react";
import { getCategoryWithSubs, listProducts } from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";
import { BigProductGrid } from "@/components/home/BigProductGrid";
import { NotFoundView } from "@/components/NotFoundView";
import { buildThumbImage, onImageSrcSetError } from "@/lib/product-image";
import type { WooProduct } from "@/lib/woo.server";

const SITE = "https://zonash.lovable.app";

const categoryQuery = (slug: string) =>
  queryOptions({
    queryKey: ["collection", slug],
    queryFn: () => getCategoryWithSubs({ data: { slug } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/c/$slug")({
  loader: async ({ params, context }) => {
    const res = await context.queryClient.ensureQueryData(categoryQuery(params.slug));
    // Upstream failure must surface as an error boundary (retryable), and an
    // unknown slug must be a real 404 — previously both silently rendered a
    // 200 "collection unavailable" placeholder.
    if (res.error) throw new Error(res.error);
    if (!res.parent) throw notFound();
    return {
      title: res.parent.name,
      count: res.parent.count ?? 0,
      image: res.parent.image?.src ?? null,
    };
  },
  head: ({ params, loaderData }) => {
    const name =
      loaderData?.title ??
      params.slug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    const title = `${name} — Zonash`;
    const description = `Shop ${name} at Zonash. Cash on delivery across Bangladesh, 7-day returns.`;
    const url = `${SITE}/c/${params.slug}`;
    const img = loaderData?.image;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: img ? "summary_large_image" : "summary" },
        ...(img && /^https:\/\//.test(img)
          ? [
              { property: "og:image", content: img },
              { name: "twitter:image", content: img },
            ]
          : []),
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: CollectionPage,
  pendingComponent: CollectionSkeleton,
  errorComponent: ({ error, reset }) => (
    <NotFoundView
      variant="error"
      title="Couldn't load this collection"
      description={error.message}
      onRetry={() => reset()}
    />
  ),
  notFoundComponent: () => (
    <NotFoundView
      title="Collection not found"
      description="This category doesn't exist yet. Browse everything else in the shop."
      primaryLabel="Browse all"
      primaryTo="/products"
    />
  ),
});

function CollectionPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(categoryQuery(slug));
  const parent = data.parent;
  const subs = data.subs;

  return (
    <div className="min-h-screen bg-surface-muted/40">
      <AppHeader />
      <main>
        {/* Every indexable page needs exactly one h1; the visual design has no
            title bar, so it is screen-reader/crawler only. */}
        <h1 className="sr-only">{parent?.name ?? slug} — Zonash</h1>
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
  // A sub tile is ~70–90 CSS px wide inside the 480px frame; without a sized
  // srcSet the browser pulled the full-size WordPress original per tile.
  const thumb = buildThumbImage(sub.image?.src, 96);
  return (
    <Link
      to="/c/$slug"
      params={{ slug: sub.slug }}
      preload="intent"
      className="group flex flex-col items-center gap-1.5"
      aria-label={`${sub.name} in ${parentSlug}`}
    >
      <span className="block aspect-square w-full overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-border/60 transition-shadow group-hover:shadow-md">
        {thumb ? (
          <img
            src={thumb.src}
            srcSet={thumb.srcSet || undefined}
            sizes="96px"
            alt={sub.image?.alt || sub.name}
            width={96}
            height={96}
            loading="lazy"
            decoding="async"
            onError={onImageSrcSetError}
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

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, refetch } =
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

  // The observer callback changes on every fetch/render; holding it in a ref
  // keeps a single observer alive for the page's lifetime instead of
  // disconnect/observe churn (which can re-fire while a page is in flight).
  const onHit = useRef<() => void>(() => {});
  onHit.current = () => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  };

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onHit.current();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);

  // Woo re-paginates live: a product published between page fetches shifts
  // every later page down one, which repeats an item and throws a duplicate
  // React key. De-dupe by id.
  const products: WooProduct[] = useMemo(() => {
    const seen = new Set<number>();
    const out: WooProduct[] = [];
    for (const page of data?.pages ?? []) {
      for (const p of (page.products ?? []) as WooProduct[]) {
        if (!p || seen.has(p.id)) continue;
        seen.add(p.id);
        out.push(p);
      }
    }
    return out;
  }, [data]);

  if (isError && products.length === 0) {
    return (
      <NotFoundView
        bare
        variant="error"
        title="Couldn't load these products"
        description="The shop is taking longer than usual to respond. Try again in a moment."
        onRetry={() => void refetch()}
      />
    );
  }


  if (!enabled) {
    return (
      <NotFoundView
        bare
        variant="empty"
        title="Collection unavailable"
        description="This collection isn't set up yet. Explore the rest of the shop while we get it ready."
      />
    );
  }

  if (isLoading && products.length === 0) return <FeedSkeleton />;

  if (products.length === 0) {
    return (
      <NotFoundView
        bare
        variant="empty"
        title="The shelves are being restocked"
        description="We're curating fresh pieces for this collection. New arrivals drop weekly — check back soon."
        primaryLabel="Explore homepage"
      />
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
        // Mirrors the real card box model (square image + ~80px meta block).
        // The old flat aspect-[3/4] block was ~19px shorter per row, so the
        // whole feed jumped when data arrived.
        <div
          key={i}
          className="overflow-hidden rounded-2xl bg-white ring-1 ring-border/60"
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <div className="skeleton-shimmer aspect-square w-full" />
          <div className="flex flex-col gap-1.5 p-2.5">
            <div className="skeleton-shimmer h-3 w-full rounded" />
            <div className="skeleton-shimmer h-3 w-2/3 rounded" />
            <div className="skeleton-shimmer h-[23px] w-1/2 rounded" />
          </div>

        </div>
      ))}
    </div>
  );
}


function CollectionSkeleton() {
  return (
    <div className="min-h-screen bg-surface-muted/40">
      <div className="h-14 border-b border-border/60 bg-background" />
      <div className="bg-background pt-2">
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
