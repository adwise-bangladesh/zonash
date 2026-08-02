import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Zap } from "lucide-react";
import type { WooCategory } from "@/lib/woo.functions";

/** Slugs that already have a hand-built tab — kept out of the dynamic list. */
const PINNED = new Set(["new-arrivals", "bestsellers", "mega-sale", "uncategorized"]);

export function CategoryTabs({ categories }: { categories: WooCategory[] | undefined }) {
  const list = useMemo(() => {
    const seen = new Set<string>();
    const out: WooCategory[] = [];
    for (const c of categories ?? []) {
      const slug = c?.slug;
      if (!slug || PINNED.has(slug) || seen.has(slug)) continue;
      seen.add(slug);
      out.push(c);
      if (out.length === 8) break;
    }
    return out;
  }, [categories]);

  return (
    <nav
      aria-label="Category tabs"
      className="sticky top-14 z-30 border-b border-border bg-background/95 backdrop-blur md:top-16"
    >
      <div className="flex gap-4 overflow-x-auto py-2 pl-[5px] pr-4 text-[12.5px] font-semibold [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:pl-4">
        <Link to="/" className="relative shrink-0 text-primary" aria-current="page">
          Recommended
          <span className="absolute inset-x-1 -bottom-2 h-[2.5px] rounded-full bg-primary" />
        </Link>
        <Link
          to="/c/$slug"
          params={{ slug: "new-arrivals" }}
          className="inline-flex shrink-0 items-center gap-1 text-emerald-600"
        >
          <Zap className="h-3.5 w-3.5 fill-emerald-500 text-emerald-500" />
          New Arrivals
        </Link>
        <Link to="/c/$slug" params={{ slug: "bestsellers" }} className="shrink-0 text-emerald-700">
          Bestsellers
        </Link>
        {list.map((c) => (
          <Link
            key={c.slug}
            to="/c/$slug"
            params={{ slug: c.slug }}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            {c.name}
          </Link>
        ))}
      </div>
    </nav>
  );
}
