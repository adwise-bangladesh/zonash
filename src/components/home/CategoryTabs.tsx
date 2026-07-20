import { Link } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import type { WooCategory } from "@/lib/woo.functions";

export function CategoryTabs({ categories }: { categories: WooCategory[] }) {
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
        {categories.slice(0, 8).map((c) => (
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
