import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { listProducts } from "@/lib/woo.functions";
import type { WooProduct } from "@/lib/woo.server";
import { BigProductGrid } from "./BigProductGrid";

export function InfiniteFeed() {
  const sentinel = useRef<HTMLDivElement>(null);

  const PER_PAGE = 18;
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["home", "feed", PER_PAGE],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listProducts({ data: { page: pageParam as number, perPage: PER_PAGE, orderby: "date" } }),
    // End when the page returns fewer than a full page OR nothing at all.
    // The strict `< PER_PAGE` check protects against endless spinner loops
    // when WooCommerce returns partial pages or an error payload.
    getNextPageParam: (last, all) => {
      const n = last.products?.length ?? 0;
      if (n === 0 || n < PER_PAGE) return undefined;
      return all.length + 1;
    },
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

  // De-dupe defensively in case pages overlap.
  const seen = new Set<number>();
  const products: WooProduct[] = [];
  for (const page of data?.pages ?? []) {
    for (const p of page.products as WooProduct[]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      products.push(p);
    }
  }

  return (
    <>
      <BigProductGrid products={products} columns={3} />
      <div ref={sentinel} className="flex items-center justify-center py-6 text-muted-foreground">
        {(isLoading || isFetchingNextPage) && (
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
