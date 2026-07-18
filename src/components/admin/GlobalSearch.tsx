/**
 * Global admin search — searches Name / Phone / Order # / Consignment / Email.
 * Cmd/Ctrl+K to focus. Click a result → navigate to /admin/orders?open=<id>.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Search, Loader2, X } from "lucide-react";
import { searchOrders } from "@/lib/woo.functions";

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function statusColor(s: string): string {
  if (s === "completed" || s === "delivered") return "bg-emerald-100 text-emerald-700";
  if (s === "processing") return "bg-blue-100 text-blue-700";
  if (s === "on-hold") return "bg-amber-100 text-amber-700";
  if (s === "cancelled" || s === "failed" || s === "refunded")
    return "bg-rose-100 text-rose-700";
  return "bg-muted text-foreground/70";
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const searchFn = useServerFn(searchOrders);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const debounced = useDebounced(q.trim(), 300);
  const enabled = debounced.length >= 2;

  const { data, isFetching } = useQuery({
    queryKey: ["admin", "global-search", debounced],
    queryFn: () => searchFn({ data: { q: debounced } }),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const results = data?.orders ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      } else if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => setActive(0), [debounced]);

  const pickIdx = (i: number) => {
    const o = results[i];
    if (!o) return;
    setOpen(false);
    setQ("");
    navigate({ to: "/admin/orders", search: { open: o.id } as never });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pickIdx(active);
    }
  };

  const hint = useMemo(() => {
    if (typeof navigator === "undefined") return "⌘K";
    return /Mac/i.test(navigator.platform) ? "⌘K" : "Ctrl K";
  }, []);

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1 md:max-w-xl">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        type="search"
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder="Search name, phone, order #, consignment, email…"
        className="h-9 w-full rounded-md border border-border bg-muted/40 pl-8 pr-16 text-[13px] outline-none transition placeholder:text-muted-foreground focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-primary/10"
      />
      <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {isFetching && enabled ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            className="pointer-events-auto grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-muted"
            aria-label="Clear"
          >
            <X className="h-3 w-3" />
          </button>
        ) : (
          <kbd className="rounded border border-border bg-background px-1.5 py-[1px] text-[10px] font-medium text-muted-foreground">
            {hint}
          </kbd>
        )}
      </div>

      {open && enabled && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
          role="listbox"
        >
          {results.length === 0 && !isFetching && (
            <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
              No orders matched “{debounced}”.
            </div>
          )}
          {results.length === 0 && isFetching && (
            <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
              Searching…
            </div>
          )}
          {results.map((o, i) => {
            const name =
              `${o.billing?.first_name ?? ""} ${o.billing?.last_name ?? ""}`.trim() ||
              o.billing?.email ||
              "Guest";
            const activeCls = i === active ? "bg-muted" : "hover:bg-muted/60";
            const itemsCount = (o.line_items ?? []).reduce(
              (s: number, li: { quantity?: number }) => s + (li.quantity ?? 0),
              0,
            );
            const firstItem = o.line_items?.[0]?.name ?? "";
            const addrParts = [
              o.billing?.address_1,
              o.billing?.city,
              o.billing?.state,
            ].filter(Boolean);
            const address = addrParts.join(", ");
            const created = o.date_created
              ? new Date(o.date_created).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "2-digit",
                })
              : "";
            return (
              <button
                type="button"
                key={o.id}
                onClick={() => pickIdx(i)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-start gap-3 border-b border-border/50 px-3 py-2.5 text-left last:border-0 ${activeCls}`}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] font-semibold text-foreground">
                      #{o.number}
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide ${statusColor(o.status)}`}
                    >
                      {o.status}
                    </span>
                    {created && (
                      <span className="text-[10.5px] text-muted-foreground">
                        {created}
                      </span>
                    )}
                    <span className="ml-auto text-[11.5px] font-semibold text-foreground/80 tabular-nums">
                      ৳ {Number(o.total || 0).toFixed(0)}
                    </span>
                  </div>
                  <div className="truncate text-[11.5px] font-medium text-foreground">
                    {name}
                    {o.billing?.phone ? (
                      <span className="text-muted-foreground"> · {o.billing.phone}</span>
                    ) : null}
                  </div>
                  {address && (
                    <div className="truncate text-[10.5px] text-muted-foreground">
                      {address}
                    </div>
                  )}
                  {(itemsCount > 0 || firstItem) && (
                    <div className="truncate text-[10.5px] text-muted-foreground">
                      {itemsCount} item{itemsCount === 1 ? "" : "s"}
                      {firstItem ? ` · ${firstItem}` : ""}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
