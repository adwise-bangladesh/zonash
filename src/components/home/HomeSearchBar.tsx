import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, Camera } from "lucide-react";

export function HomeSearchBar() {
  const [q, setQ] = useState("");
  const nav = useNavigate();
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const t = q.trim();
        nav({ to: "/products", search: t ? { q: t } : {} });
      }}
      className="container-page pt-3 pb-2 md:pt-5"
    >
      <div className="relative flex h-11 w-full items-center rounded-full border-2 border-primary bg-background pl-4 pr-2 shadow-sm">
        <Search className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="search"
          placeholder="Rings, earrings, necklaces…"
          aria-label="Search products"
          className="mx-2 min-w-0 flex-1 bg-transparent text-[14px] font-medium text-ink outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          aria-label="Visual search"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-primary hover:bg-primary/10"
        >
          <Camera className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
