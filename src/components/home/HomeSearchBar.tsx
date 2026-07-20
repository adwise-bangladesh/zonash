import { useEffect, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { Search, Camera, Clock } from "lucide-react";

const POPULAR = [
  "Engagement Rings",
  "Gold Bangles",
  "Earrings",
  "Bridal Sets",
  "Necklaces",
  "Under 2000 Tk",
  "Gift Items",
];

const RECENT_KEY = "zonash.recent-searches";

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").slice(0, 4) : [];
  } catch {
    return [];
  }
}

function saveRecent(term: string) {
  if (typeof window === "undefined") return;
  const t = term.trim();
  if (!t) return;
  const cur = loadRecent().filter((x) => x.toLowerCase() !== t.toLowerCase());
  cur.unshift(t);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, 4)));
}

export function HomeSearchBar() {
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const nav = useNavigate();

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  const go = (term: string) => {
    const t = term.trim();
    if (t) saveRecent(t);
    setRecent(loadRecent());
    nav({ to: "/products", search: t ? { q: t } : {} });
  };

  return (
    <div className="container-page pt-3 pb-2 md:pt-5">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
        className="mx-auto w-full max-w-2xl"
      >
        {/* Search input */}
        <div className="relative flex items-center rounded-2xl border border-border bg-background p-1.5 shadow-[0_10px_30px_-18px_rgba(15,15,15,0.25)] transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
          <div className="pl-3 text-muted-foreground">
            <Search className="h-5 w-5" aria-hidden="true" />
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            aria-label="Search products"
            placeholder="Search for rings, necklaces, 22k gold…"
            className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-muted-foreground/70"
          />
          <div className="flex shrink-0 items-center gap-1 pr-1">
            <button
              type="button"
              aria-label="Visual search"
              className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary"
            >
              <Camera className="h-5 w-5" />
            </button>
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-[12px] font-semibold uppercase tracking-wider text-primary-foreground transition-colors hover:brightness-110 active:scale-[0.98]"
            >
              Search
            </button>
          </div>
        </div>

        {/* Popular collections */}
        <div className="mt-4 flex items-center justify-between px-1">
          <span className="text-[11px] font-bold uppercase tracking-widest text-primary">
            Popular Collections
          </span>
          <Link
            to="/categories"
            className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            View All
          </Link>
        </div>

        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {POPULAR.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => go(label)}
              className="group inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface-muted/60 px-4 py-2 text-[13px] font-medium text-foreground/80 transition-all hover:border-primary hover:bg-primary/[0.04] hover:text-primary"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary/30 transition-colors group-hover:bg-primary" />
              {label}
            </button>
          ))}
        </div>

        {/* Recent */}
        {recent.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Recent
            </span>
            {recent.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => go(r)}
                className="text-[12px] font-medium text-foreground/70 underline decoration-border underline-offset-4 transition-colors hover:text-primary hover:decoration-primary/60"
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}
