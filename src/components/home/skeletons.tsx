/**
 * Homepage placeholders.
 *
 * These are the single source of truth for every loading state on `/`:
 * the route-level `pendingComponent`, the per-section Suspense fallbacks and
 * (for deals) the boundary fallback all render the *same* markup. Duplicating
 * the shapes inline — as the route used to — is how skeletons silently drift
 * a few pixels away from the components they stand in for, producing a visible
 * jump on swap. Every box below mirrors the real element's exact width,
 * height, radius, ring and spacing classes.
 */

/** Mirrors `DealsStrip`: 58/84px banner + horizontally scrolling deal cards. */
export function DealsStripSkeleton() {
  return (
    <section aria-hidden="true" className="pb-3">
      <div className="mx-[5px] overflow-hidden rounded-2xl bg-white p-2.5 ring-1 ring-border/60 shadow-sm md:p-3">
        <div className="flex items-stretch gap-2">
          {/* Left banner — same footprint as a deal card (w + aspect + label row) */}
          <div className="flex w-[58px] shrink-0 flex-col overflow-hidden rounded-lg md:w-[84px]">
            <div className="aspect-square w-full skeleton-shimmer rounded-none" />
            <div className="flex h-[23px] items-center justify-center skeleton-shimmer md:h-[27px]" />
          </div>

          {/* Deal cards: `-mr-2.5 … pr-2.5` reproduces the scroller's bleed so
              the last visible card is clipped exactly as in the real strip. */}
          <div className="-mr-2.5 flex min-w-0 flex-1 gap-2 overflow-hidden pr-2.5 md:-mr-3 md:pr-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="skeleton-row-fade flex w-[58px] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-white md:w-[84px]"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="aspect-square w-full skeleton-shimmer rounded-none" />
                <div className="flex h-[23px] items-center justify-center bg-white md:h-[27px]">
                  <div className="h-2.5 w-8 skeleton-shimmer rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Mirrors `CategoryTabs`: sticky bar, `gap-4 py-2 pl-[5px]`, 14px pills. */
export function CategoryTabsSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="sticky top-14 z-30 border-b border-border bg-background/95 backdrop-blur md:top-16"
    >
      <div className="flex gap-4 py-2 pl-[5px] pr-4 md:pl-4">
        {[64, 92, 78, 70, 82, 74, 90].map((w, i) => (
          <div
            key={i}
            className="h-4 shrink-0 skeleton-shimmer rounded-full"
            style={{ width: w }}
          />
        ))}
      </div>
    </div>
  );
}

/** Mirrors `AppHeader`: h-14 / md:h-16 sticky bar with logo + 2 icon buttons. */
export function AppHeaderSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-md"
    >
      <div className="container-page flex h-14 items-center justify-between gap-3 md:h-16">
        <div className="h-6 w-28 skeleton-shimmer rounded-md md:h-7 md:w-32" />
        <div className="flex items-center gap-1">
          <div className="h-9 w-9 skeleton-shimmer rounded-full md:h-10 md:w-10" />
          <div className="hidden h-10 w-10 skeleton-shimmer rounded-full md:block" />
          <div className="h-9 w-9 skeleton-shimmer rounded-full md:h-10 md:w-10" />
        </div>
      </div>
    </div>
  );
}

/** Mirrors `PromoIcons`: 5 shortcuts, h-14 rounded-2xl tile + label. */
export function PromoIconsSkeleton() {
  return (
    <section aria-hidden="true" className="bg-background pb-4 pt-2">
      <div className="container-page">
        <div className="mx-auto grid max-w-3xl grid-cols-5 gap-2 md:gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="h-14 w-14 skeleton-shimmer rounded-2xl md:h-16 md:w-16" />
              <div className="h-2.5 w-12 skeleton-shimmer rounded" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
