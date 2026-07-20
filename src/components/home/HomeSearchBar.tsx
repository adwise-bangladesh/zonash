import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, Camera, Sparkles, Mic } from "lucide-react";

const ROTATING = [
  "Diamond rings",
  "Gold necklaces",
  "Pearl earrings",
  "Bridal sets",
  "Anklets under 2000 Tk",
];

const TRENDING = ["Rings", "Earrings", "Necklaces", "Bridal", "Under ৳1k"];

export function HomeSearchBar() {
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [idx, setIdx] = useState(0);
  const nav = useNavigate();

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % ROTATING.length), 2600);
    return () => clearInterval(t);
  }, []);

  const placeholder = useMemo(() => `Search “${ROTATING[idx]}”`, [idx]);

  const go = (term: string) => {
    const t = term.trim();
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
        className="relative"
      >
        {/* Animated gradient border */}
        <div
          className={`relative rounded-full p-[1.5px] transition-all duration-300 ${
            focused
              ? "bg-[conic-gradient(from_0deg,theme(colors.primary.DEFAULT),#c4a35a,theme(colors.primary.DEFAULT))] shadow-[0_10px_30px_-12px_rgba(58,2,3,0.45)]"
              : "bg-gradient-to-r from-primary/70 via-primary/40 to-primary/70 shadow-[0_4px_14px_-8px_rgba(58,2,3,0.35)]"
          }`}
        >
          <div className="flex h-12 w-full items-center rounded-full bg-background pl-4 pr-1.5">
            <Sparkles
              className={`h-4 w-4 shrink-0 transition-transform ${
                focused ? "scale-110 text-primary" : "text-primary/80"
              }`}
              aria-hidden="true"
            />
            <div className="relative mx-2 min-w-0 flex-1">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 120)}
                type="search"
                aria-label="Search products"
                placeholder={placeholder}
                className="peer w-full bg-transparent text-[14px] font-medium text-ink outline-none placeholder:text-muted-foreground/70"
              />
            </div>

            <button
              type="button"
              aria-label="Voice search"
              className="hidden h-9 w-9 shrink-0 place-items-center rounded-full text-primary/80 hover:bg-primary/10 sm:grid"
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Visual search"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-primary/80 hover:bg-primary/10"
            >
              <Camera className="h-4 w-4" />
            </button>
            <button
              type="submit"
              aria-label="Search"
              className="ml-1 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm transition-transform hover:brightness-110 active:scale-[0.97]"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Search</span>
            </button>
          </div>
        </div>

        {/* Trending chips */}
        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Trending
          </span>
          {TRENDING.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setQ(t);
                go(t);
              }}
              className="shrink-0 rounded-full border border-primary/15 bg-primary/[0.04] px-3 py-1 text-[12px] font-medium text-primary transition-colors hover:bg-primary/10"
            >
              {t}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
