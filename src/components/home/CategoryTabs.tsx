import { Link } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import type { WooCategory } from "@/lib/woo.functions";

export function CategoryTabs({ categories }: { categories: WooCategory[] }) {
  return (
    <nav
      aria-label="Category tabs"
      className="sticky top-12 z-30 border-b border-border bg-background/95 backdrop-blur md:top-14"
    >
      <div className="scroll-snap-x flex gap-4 overflow-x-auto pl-3 pr-4 py-2 text-[12.5px] font-semibold [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:pl-4">
        <Link
          to="/"
          className="relative shrink-0 snap-start text-primary"
          aria-current="page"
        >
          Recommended
          <span className="absolute inset-x-1 -bottom-2 h-[2.5px] rounded-full bg-primary" />
        </Link>
        <Link
          to="/products"
          search={{ orderby: "date" } as never}
          className="inline-flex shrink-0 snap-start items-center gap-1 text-emerald-600"
        >
          <Zap className="h-3.5 w-3.5 fill-emerald-500 text-emerald-500" />
          New Arrivals
        </Link>
        <Link to="/products" search={{ featured: true } as never} className="shrink-0 snap-start text-emerald-700">
          Bestsellers
        </Link>
        {categories.slice(0, 8).map((c) => (
          <Link
            key={c.slug}
            to="/products"
            search={{ category: c.slug }}
            className="shrink-0 snap-start text-muted-foreground hover:text-foreground"
          >
            {c.name}
          </Link>
        ))}
      </div>
    </nav>
  );
}
